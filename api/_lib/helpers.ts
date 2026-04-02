import supabase from "./supabase";

export async function logActivity(
  userId: number,
  action: string,
  relatedTo: string,
  type: string
) {
  try {
    await supabase
      .from("activity_log")
      .insert({ user_id: userId, action, related_to: relatedTo, type });
  } catch {}
}
