export interface PromptTemplate {
  label: string;
  text: string;
  category: string;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  { 
    category: "Writing",
    label: "Email Drafting", 
    text: "Draft a professional email regarding [Subject]. The tone should be [Tone, e.g., polite, urgent]. Key points to include:\n- [Point 1]\n- [Point 2]" 
  },
  { 
    category: "Analysis",
    label: "Summarization", 
    text: "Please provide a concise summary of the following text, highlighting the main points and key takeaways:\n\n[Insert Text Here]" 
  },
  { 
    category: "Coding",
    label: "Code Explanation", 
    text: "Explain the following code step-by-step. What does it do, and how does it work?\n\n```\n[Insert Code Here]\n```" 
  },
  { 
    category: "Coding",
    label: "Code Review", 
    text: "Please review the following code for security vulnerabilities, performance issues, and best practices:\n\n```\n[Insert Code Here]\n```" 
  },
  { 
    category: "Writing",
    label: "Brainstorm", 
    text: "Generate 10 creative ideas for [Topic]:\n\n" 
  }
];
