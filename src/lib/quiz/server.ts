import "server-only";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { parseQuizAnswers, QUIZ_COOKIE, type QuizAnswers } from "./answers";

// Metadata first: it is the copy that survives a switch of browser between
// the ad and the confirmation email. Prefill only -- both sources are
// visitor-controlled, which is fine for choosing what a form starts on.
export async function readQuizAnswers(user: User): Promise<QuizAnswers | null> {
  const fromMetadata = parseQuizAnswers(user.user_metadata?.quiz);
  if (fromMetadata) return fromMetadata;
  const store = await cookies();
  return parseQuizAnswers(store.get(QUIZ_COOKIE)?.value);
}
