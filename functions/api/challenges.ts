import { createTrackingContext, type Env } from "../_shared/createTrackingContext";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const tracking = createTrackingContext(context.env);
  try {
    return tracking.json(await tracking.handlers.listChallenges());
  } catch (caught) {
    return tracking.error(caught);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const tracking = createTrackingContext(context.env);
  try {
    return tracking.json(
      await tracking.handlers.createChallenge(
        (await tracking.readJson(context.request)) as {
          startTitle: string;
          targetTitle: string;
        },
      ),
    );
  } catch (caught) {
    return tracking.error(caught);
  }
};
