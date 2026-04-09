import type { Business } from "../types/core";
import type { PromptIntent } from "../domain/promptProfiles";
import { generatePrompts, promptStringsFromSpecs } from "../systems/promptEngine";
import { buildAdaptiveAnswerResult } from "../systems/adaptiveAnswerEngine";
import { intentWeight } from "../domain/intentWeights";
import { calculateWeightedDominance } from "../scoring/dominance";
import { scanAllModels } from "../models/multiModel";
import {
  createPromptRun,
  getJobOverridePrompts,
  insertScan,
  loadBusiness,
  saveJobSummary,
  updateJobStatus,
  type JobSummary,
} from "../db/repository";
import { calculateConsensus } from "../learning/consensus";
import { extractModelFeatures } from "../learning/modelBehaviorProfiler";
import {
  getHistoricalMaxScore,
  getRecentPatternHistory,
  patternIdForPrompt,
  saveModelBehaviorSample,
  savePatternResult,
} from "../learning/patternMemory";
import { detectDecay } from "../learning/decay";
import { calculateOwnership } from "../learning/ownership";
import { clusterPrompts, primaryClusterForPrompt } from "../learning/promptClusters";
import { isLeadSentenceMention } from "../learning/firstMention";
import { blogPublicUrlForSlug, deployBlogHtml } from "../integration/blogDeploy";
import { outcomeDeploySlug } from "../integration/deploySlug";
import { buildCoverageAngles, buildInternalAiPageLinks } from "../outcomes/coverageAngles";
import { pushWinningPattern } from "../integration/edgeSync";
import { deployToGitHubPages, predictPublicGithubPagesUrl } from "../integration/githubPagesDeploy";
import { outcomePageHtml } from "../integration/outcomePageHtml";
import { primaryEntityLabel } from "../domain/authorityProfiles";
import { computeWinScore } from "../domain/outcomeWin";
import { detectSubIntent } from "../domain/subIntent";
import { getPatternWinAggregate } from "../learning/patternInsights";
import { patternConfidenceFromSamples } from "../learning/intentPatterns";
import { recordTargetedExploreLift } from "../learning/targetedExploreStats";
import { decideOutcomeAction, mergeRegenerationSeverity } from "../outcomes/outcomeDecision";
import { compareLatestOutcomes, didOutcomeImprove } from "../outcomes/outcomeComparison";
import { reinforceWinningPattern } from "../outcomes/reinforceEngine";
import { shouldReinforce } from "../outcomes/reinforcementDecision";
import { addEntityReinforcement } from "../outcomes/entityReinforcement";
import { tweakVariant } from "../outcomes/tweakVariant";
import {
  excludeClientDomain,
  getTopCompetitors,
} from "../outcomes/competitorAnalysis";
import { extractCitations } from "../outcomes/extractCitations";
import { generateReplacementContent } from "../outcomes/replacementGenerator";
import { generatePersonaPosts } from "../distribution/distribute";

function deployThreshold(): number {
  const n = Number(process.env.EDGE_DEPLOY_MIN_SCORE?.trim());
  return Number.isFinite(n) ? n : 60;
}

/** Optional cap on prompt runs per job (cost control); unset = all generated prompts. */
function limitPromptSpecs<T>(specs: T[]): T[] {
  const raw = process.env.AUDIT_MAX_PROMPTS?.trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return specs;
  return specs.slice(0, Math.min(n, specs.length));
}

export async function processAuditJob(jobId: string, businessId: string): Promise<void> {
  updateJobStatus(jobId, "running", null);
  const business = loadBusiness(businessId);
  if (!business) {
    updateJobStatus(jobId, "failed", "Business not found");
    return;
  }

  const overrides = getJobOverridePrompts(jobId);
  const promptSpecs = limitPromptSpecs(
    overrides
      ? overrides.map((prompt) => ({ prompt, intent: "best" as PromptIntent }))
      : [...generatePrompts(business)].sort((a, b) => intentWeight(b.intent) - intentWeight(a.intent)),
  );
  const promptClusters = clusterPrompts(promptStringsFromSpecs(promptSpecs));

  const dominanceByIntentAgg: Record<string, { sum: number; n: number }> = {};
  const winByIntentAgg: Record<string, { sum: number; n: number }> = {};

  let afterTotal = 0;
  let afterCount = 0;
  let baselineTotal = 0;
  let baselineCount = 0;
  let scanCount = 0;
  const modelsUsed = new Set<string>();
  let sumConsensusB = 0;
  let sumConsensusA = 0;
  let learningWrites = 0;
  let decayEvents = 0;
  let sumOwnership = 0;

  let bestDeploy:
    | {
        adaptiveAnswer: string;
        patternId: string;
        dominanceScore: number;
        cluster: string;
        prompt: string;
        evidence: unknown[];
      }
    | undefined;

  try {
    for (let i = 0; i < promptSpecs.length; i++) {
      const { prompt, intent } = promptSpecs[i]!;
      const subIntent = detectSubIntent(prompt);
      const entityForWin = primaryEntityLabel(business);
      const iw = intentWeight(intent);
      const promptRunId = createPromptRun(jobId, prompt, i, intent);
      const pid = patternIdForPrompt(prompt);
      const cluster = primaryClusterForPrompt(prompt);

      const historicalBest = getHistoricalMaxScore(pid, jobId);

      const multiBefore = await scanAllModels(prompt, { business });
      const consensusB = calculateConsensus(
        multiBefore.map((m) => m.result),
        business.name,
      );
      sumConsensusB += consensusB;

      let baselineSumPrompt = 0;
      let baselineNPrompt = 0;

      for (const { model, result } of multiBefore) {
        modelsUsed.add(model);
        const features = extractModelFeatures(result.raw);
        const mentionLead = isLeadSentenceMention(business.name, result.raw);
        const dom = calculateWeightedDominance(result, business.name, consensusB, iw);
        baselineSumPrompt += dom;
        baselineNPrompt += 1;
        insertScan({
          promptRunId,
          model,
          phase: "baseline",
          raw: result.raw,
          entities: result.entities,
          firstMention: result.firstMention,
          score: dom,
        });
        savePatternResult({
          patternId: pid,
          prompt,
          score: dom,
          model,
          phase: "baseline",
          jobId,
          businessId,
          features,
          mentionLead,
          intent,
          subIntent,
          winScore: computeWinScore(result, entityForWin),
        });
        saveModelBehaviorSample(model, features, dom);
        learningWrites += 2;
        baselineTotal += dom;
        baselineCount += 1;
        scanCount += 1;
      }

      const multiAfter = await scanAllModels(prompt, { business });
      const consensusA = calculateConsensus(
        multiAfter.map((m) => m.result),
        business.name,
      );
      sumConsensusA += consensusA;

      let afterMax = 0;
      let afterSum = 0;
      let afterN = 0;
      let winSumPrompt = 0;
      let winNPrompt = 0;

      for (const { model, result } of multiAfter) {
        const features = extractModelFeatures(result.raw);
        const mentionLead = isLeadSentenceMention(business.name, result.raw);
        const dom = calculateWeightedDominance(result, business.name, consensusA, iw);
        winSumPrompt += computeWinScore(result, entityForWin);
        winNPrompt += 1;
        if (dom > afterMax) afterMax = dom;
        afterSum += dom;
        afterN += 1;
        insertScan({
          promptRunId,
          model,
          phase: "after",
          raw: result.raw,
          entities: result.entities,
          firstMention: result.firstMention,
          score: dom,
        });
        savePatternResult({
          patternId: pid,
          prompt,
          score: dom,
          model,
          phase: "after",
          jobId,
          businessId,
          features,
          mentionLead,
          intent,
          subIntent,
          winScore: computeWinScore(result, entityForWin),
        });
        saveModelBehaviorSample(model, features, dom);
        learningWrites += 2;
        afterTotal += dom;
        afterCount += 1;
        scanCount += 1;
      }

      let regenSeverity: "medium" | "high" | null = null;
      let strongWinThisPrompt = false;
      for (const { model: modelName } of multiAfter) {
        const comp = compareLatestOutcomes(prompt, modelName);
        if (comp) {
          const improved = didOutcomeImprove(comp);
          const competitors = excludeClientDomain(
            getTopCompetitors(comp.afterCitations),
            business,
          );
          console.log(
            "🏁 Competitors:",
            competitors.slice(0, 3),
            `(model=${modelName})`,
          );
          console.log("📈 Outcome:", {
            improved,
            model: modelName,
            new: comp.newCitations.length,
            lost: comp.lostCitations.length,
            citationDelta: comp.citationDelta,
            promptPreview: prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt,
          });

          const decision = decideOutcomeAction(comp);
          console.log("🧠 Decision:", {
            regenerate: decision.shouldRegenerate,
            reason: decision.reason,
            severity: decision.severity,
            model: modelName,
          });
          regenSeverity = mergeRegenerationSeverity(regenSeverity, decision);

          if (shouldReinforce(comp)) {
            strongWinThisPrompt = true;
          }
        }
      }

      if (strongWinThisPrompt) {
        console.log("🔥 Strong win detected — reinforcing signal");
        const winningAnswer = buildAdaptiveAnswerResult(prompt, business, { intent }).answer;
        const reinforcedBody = addEntityReinforcement(winningAnswer, business);
        const personaPosts = generatePersonaPosts(reinforcedBody);
        console.log(
          "👤 Distribution-ready persona variants:",
          personaPosts.map((x) => ({
            persona: x.persona,
            chars: x.content.length,
            preview: `${x.content.slice(0, 100)}${x.content.length > 100 ? "…" : ""}`,
          })),
        );
        const reinforceBaseSlug = outcomeDeploySlug(jobId, prompt);
        await reinforceWinningPattern({
          prompt,
          business,
          baseSlug: reinforceBaseSlug,
          winningContent: reinforcedBody,
        });
      }

      if (regenSeverity !== null) {
        console.log(
          "⚡ Triggering regeneration (multi-variant) for:",
          prompt.length > 120 ? `${prompt.slice(0, 120)}…` : prompt,
        );

        const pooledCitations = Array.from(
          new Set(multiAfter.flatMap((m) => extractCitations(m.result.raw))),
        );
        const competitorDomains = excludeClientDomain(
          getTopCompetitors(pooledCitations),
          business,
        );
        const replacementBody =
          competitorDomains.length > 0
            ? generateReplacementContent(prompt, competitorDomains, business.name)
            : null;
        if (replacementBody) {
          console.log(
            "⚔️ Citation takeover variant (top domains):",
            competitorDomains.slice(0, 5),
          );
        }

        let variants = [
          buildAdaptiveAnswerResult(prompt, business, { intent }),
          buildAdaptiveAnswerResult(prompt, business, { intent, forceExplore: true }),
          buildAdaptiveAnswerResult(prompt, business, { intent }),
          ...(replacementBody
            ? [{ answer: replacementBody } as ReturnType<typeof buildAdaptiveAnswerResult>]
            : []),
        ];

        const winAgg = getPatternWinAggregate(pid);
        if (winAgg && winAgg.avgWinScore > 0.7) {
          console.log("🎯 Strong pattern — extra deploy slot for lead variant", {
            patternId: `${pid.slice(0, 12)}…`,
            avgWinScore: winAgg.avgWinScore,
            samples: winAgg.samples,
          });
          variants = [variants[0]!, ...variants];
        }

        console.log("🆕 Variant 1 preview:", variants[0]!.answer.slice(0, 200));

        const baseSlug = outcomeDeploySlug(jobId, prompt);
        const coverageAngles = buildCoverageAngles(prompt, competitorDomains);
        const nAngles = coverageAngles.length;
        const nVar = variants.length;

        for (let i = 0; i < nAngles; i++) {
          const angle = coverageAngles[i]!;
          const relatedLinks = buildInternalAiPageLinks(
            coverageAngles,
            i,
            blogPublicUrlForSlug,
            (slug) => predictPublicGithubPagesUrl(slug),
          );

          let body = tweakVariant(variants[i % nVar]!.answer, (i % 3) + 1);
          body = addEntityReinforcement(body, business);

          const metaTitle = `${angle.h1} | ${business.name}`;
          const canonicalUrl = blogPublicUrlForSlug(angle.slug);
          const pageHtml = outcomePageHtml({
            title: metaTitle,
            h1: angle.h1,
            content: body,
            competitors: competitorDomains,
            business: {
              name: business.name,
              service: business.service,
              location: business.location,
              specialty: business.specialty,
              domain: business.domain,
            },
            canonicalUrl,
            relatedLinks,
          });

          const githubUrl = await deployToGitHubPages(pageHtml, angle.slug);
          const blogUrl = deployBlogHtml(pageHtml, angle.slug);

          console.log(
            `🚀 Angle ${i + 1}/${nAngles} (${baseSlug} cluster) GitHub:`,
            githubUrl ?? "(skipped or failed — check env / token)",
          );
          console.log(`📝 Angle ${i + 1}/${nAngles} AI page:`, blogUrl);
        }
      }

      const afterAvg = afterN ? afterSum / afterN : 0;
      const baselineAvgPrompt = baselineNPrompt ? baselineSumPrompt / baselineNPrompt : 0;
      if (detectDecay(historicalBest, afterMax)) {
        decayEvents += 1;
      }

      const forceExplore = detectDecay(historicalBest, afterMax);
      const dominanceSoFar: Record<string, number> = {};
      const intentConfidenceByIntent: Record<string, number> = {};
      const winRateSoFar: Record<string, number> = {};
      const winSamplesSoFar: Record<string, number> = {};
      for (const [k, v] of Object.entries(dominanceByIntentAgg)) {
        if (v.n > 0) {
          dominanceSoFar[k] = Math.round(v.sum / v.n);
          intentConfidenceByIntent[k] = patternConfidenceFromSamples(v.n);
        }
      }
      for (const [k, v] of Object.entries(winByIntentAgg)) {
        if (v.n > 0) {
          winRateSoFar[k] = Math.round((v.sum / v.n) * 1000) / 1000;
          winSamplesSoFar[k] = v.n;
        }
      }
      const adaptiveResult = buildAdaptiveAnswerResult(prompt, business, {
        forceExplore,
        intent,
        dominanceByIntent: dominanceSoFar,
        intentConfidenceByIntent,
        winRateByIntent: winRateSoFar,
        winRateSamplesByIntent: winSamplesSoFar,
      });
      const adaptive = adaptiveResult.answer;

      const liftDelta = afterAvg - baselineAvgPrompt;
      if (Number.isFinite(liftDelta)) {
        if (adaptiveResult.exploreChannel === "weakest") {
          recordTargetedExploreLift({ type: "weakest", delta: liftDelta });
        } else if (adaptiveResult.exploreChannel === "rotation") {
          recordTargetedExploreLift({ type: "rotation", delta: liftDelta });
        }
      }

      const ownership = calculateOwnership(getRecentPatternHistory(pid, 48));
      sumOwnership += ownership;

      const meanAfterThisPrompt = afterAvg;
      const meanWinThisPrompt = winNPrompt ? winSumPrompt / winNPrompt : 0;
      const agg = dominanceByIntentAgg[intent] ?? { sum: 0, n: 0 };
      agg.sum += meanAfterThisPrompt;
      agg.n += 1;
      dominanceByIntentAgg[intent] = agg;
      const wag = winByIntentAgg[intent] ?? { sum: 0, n: 0 };
      wag.sum += meanWinThisPrompt;
      wag.n += 1;
      winByIntentAgg[intent] = wag;

      const evidenceList = [
        ...new Set(multiAfter.flatMap((m) => m.result.evidence).filter((x) => x && String(x).trim())),
      ];
      if (
        !bestDeploy ||
        meanAfterThisPrompt > bestDeploy.dominanceScore ||
        (meanAfterThisPrompt === bestDeploy.dominanceScore && adaptive.length > bestDeploy.adaptiveAnswer.length)
      ) {
        bestDeploy = {
          adaptiveAnswer: adaptive,
          patternId: pid,
          dominanceScore: Math.round(meanAfterThisPrompt),
          cluster,
          prompt,
          evidence: evidenceList,
        };
      }
    }

    const jobDominance = afterCount ? Math.round(afterTotal / afterCount) : 0;
    let edgeDeployed = false;

    if (bestDeploy && jobDominance >= deployThreshold()) {
      const r = await pushWinningPattern({
        clientId: businessId,
        business,
        prompt: bestDeploy.prompt,
        adaptiveAnswer: bestDeploy.adaptiveAnswer,
        patternId: bestDeploy.patternId,
        dominanceScore: bestDeploy.dominanceScore,
        cluster: bestDeploy.cluster,
        evidence: bestDeploy.evidence,
      });
      edgeDeployed = r.ok;
    }

    const dominanceByIntent: Record<string, number> = {};
    for (const [k, v] of Object.entries(dominanceByIntentAgg)) {
      if (v.n > 0) dominanceByIntent[k] = Math.round(v.sum / v.n);
    }

    const summary: JobSummary = {
      dominanceScore: jobDominance,
      promptCoverage: promptSpecs.length,
      modelsUsed: [...modelsUsed],
      avgBaselineScore: baselineCount ? Math.round(baselineTotal / baselineCount) : 0,
      avgAfterScore: afterCount ? Math.round(afterTotal / afterCount) : 0,
      scansTotal: scanCount,
      avgConsensusBaseline: promptSpecs.length
        ? Math.round((sumConsensusB / promptSpecs.length) * 1000) / 1000
        : 0,
      avgConsensusAfter: promptSpecs.length
        ? Math.round((sumConsensusA / promptSpecs.length) * 1000) / 1000
        : 0,
      learningWrites,
      avgPromptOwnership: promptSpecs.length
        ? Math.round((sumOwnership / promptSpecs.length) * 1000) / 1000
        : 0,
      decayEvents,
      edgeDeployed,
      promptClusters,
      dominanceByIntent,
    };

    saveJobSummary(jobId, summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    updateJobStatus(jobId, "failed", msg);
  }
}
