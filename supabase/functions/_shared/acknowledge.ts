/** Retry only the token-guarded database acknowledgement, never the email send. */
export async function acknowledgeNotification<T extends { error: unknown }>(
  finish: () => PromiseLike<T>,
  pause: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
): Promise<T> {
  let result = await finish();
  for (let attempt = 1; result.error && attempt < 3; attempt++) {
    await pause(attempt * 250);
    result = await finish();
  }
  return result;
}
