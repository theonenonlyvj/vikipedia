import { createTrackingContext, type Env } from "../../_shared/createTrackingContext";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const tracking = createTrackingContext(context.env);
  try {
    const account = await tracking.authorize(context.request);
    const input = (await tracking.readJson(context.request)) as {
      challengeId: string;
      publicName: string;
    };
    return tracking.json(
      await tracking.handlers.startRun({
        challengeId: input.challengeId,
        accountId: account.accountId,
        publicName: input.publicName,
        identityStatus: account.status,
      }),
    );
  } catch (caught) {
    return tracking.error(caught);
  }
};
