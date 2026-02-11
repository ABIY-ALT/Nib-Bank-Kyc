
'use server';
/**
 * @fileOverview AI Flow to analyze historical KYC amendments and suggest standardized findings.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const LearnFindingsInputSchema = z.object({
  historicalRemarks: z.array(z.string()).describe('A list of remarks from past KYC amendment requests.'),
  existingFindingTitles: z.array(z.string()).describe('Titles of findings already in the library to avoid duplicates.'),
});

const SuggestedFindingSchema = z.object({
  title: z.string().describe('Short, descriptive title for the standardized finding.'),
  description: z.string().describe('Detailed standardized comment for the officer to use.'),
  category: z.enum(['Identity', 'Documentation', 'Compliance', 'Account Validation']),
  severity: z.enum(['Low', 'Medium', 'High', 'Critical']),
  applicableTo: z.array(z.string()).describe('Account types this applies to (e.g. INDIVIDUAL, COMPANY).'),
});

const LearnFindingsOutputSchema = z.object({
  suggestedFindings: z.array(SuggestedFindingSchema),
});

export async function learnKYCFindings(input: z.infer<typeof LearnFindingsInputSchema>) {
  return learnKYCFindingsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'learnKYCFindingsPrompt',
  input: { schema: LearnFindingsInputSchema },
  output: { schema: LearnFindingsOutputSchema },
  prompt: `You are an expert KYC Compliance Analyst.
  
Analyze the following historical remarks provided by KYC Officers when requesting amendments.
Your goal is to identify RECURRING MISTAKES or FREQUENT REQUIREMENTS that should be standardized into a professional knowledge base.

REMARKS TO ANALYZE:
{{#each historicalRemarks}}
- {{{this}}}
{{/each}}

EXISTING FINDINGS (DO NOT DUPLICATE THESE):
{{#each existingFindingTitles}}
- {{{this}}}
{{/each}}

Instructions:
1. Group similar informal remarks into one professional "Standardized Finding".
2. Create a professional, clear Title and a detailed Description that a Branch Officer can follow easily.
3. Assign an appropriate Category, Severity, and define which Account Types it applies to.
4. Only suggest NEW findings that are not in the existing list.
5. If no new patterns are found, return an empty array.`,
});

const learnKYCFindingsFlow = ai.defineFlow(
  {
    name: 'learnKYCFindingsFlow',
    inputSchema: LearnFindingsInputSchema,
    outputSchema: LearnFindingsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
