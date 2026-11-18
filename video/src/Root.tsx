import { Composition } from "remotion";
import { BandeAnnonce, DUREE, FPS } from "./BandeAnnonce";

export const Root = () => (
  <Composition
    id="BandeAnnonce"
    component={BandeAnnonce}
    durationInFrames={DUREE}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
