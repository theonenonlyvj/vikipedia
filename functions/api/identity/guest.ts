import { createTrackingContext, type Env } from "../../_shared/createTrackingContext";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const tracking = createTrackingContext(context.env);
  try {
    return tracking.json(
      await tracking.identity.quick(
        (await tracking.readJson(context.request)) as {
          deviceCredential: string;
          displayName: string;
        },
      ),
    );
  } catch (caught) {
    return tracking.error(caught);
  }
};
