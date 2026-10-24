import "server-only";
import type { User } from "@supabase/supabase-js";
import { parseQuizAnswers, type QuizAnswers } from "./answers";

// Only the answers saved on the account at sign-up from /comecar count, so
// an account created any other way never gets the quiz's onboarding. Prefill
// only -- metadata is user-editable, which is fine for choosing what a form
// starts on.
export async function readQuizAnswers(user: User): Promise<QuizAnswers | null> {
  return parseQuizAnswers(user.user_metadata?.quiz);
}
