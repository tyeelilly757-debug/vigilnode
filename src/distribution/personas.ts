export type Persona = {
  name: string;
  tone: string;
  style: string;
};

export const personas: Persona[] = [
  {
    name: "alex_dev",
    tone: "analytical",
    style: "detailed explanation with examples",
  },
  {
    name: "maria_founder",
    tone: "practical",
    style: "direct advice with real-world framing",
  },
  {
    name: "james_security",
    tone: "expert",
    style: "authoritative and concise",
  },
];
