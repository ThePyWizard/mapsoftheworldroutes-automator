import { Composition, staticFile } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import { TravelRoute, TravelRouteSchema } from "./TravelRoute";
import type { TravelRouteProps } from "./TravelRoute";
import { Input, ALL_FORMATS, UrlSource } from "mediabunny";
import routesData from "../routes.json";

const FPS = 30;

const getDuration = async (src: string) => {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(src, {
      getRetryDelay: () => null,
    }),
  });
  return input.computeDuration();
};

const calculateMetadata: CalculateMetadataFunction<TravelRouteProps> = async ({
  props,
}) => {
  const [audioDuration, outroDuration, videoDuration] = await Promise.all([
    getDuration(staticFile(props.audioFile)),
    getDuration(staticFile(props.outroFile)),
    getDuration(staticFile(props.videoFile)),
  ]);

  const mainDurationInFrames = Math.ceil(audioDuration * FPS);
  const outroDurationInFrames = Math.ceil(outroDuration * FPS);
  const videoPlaybackRate = videoDuration / audioDuration;

  return {
    durationInFrames: mainDurationInFrames + outroDurationInFrames,
    props: {
      ...props,
      mainDurationInFrames,
      outroDurationInFrames,
      videoPlaybackRate,
    },
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {routesData.map((route) => (
        <Composition
          key={route.id}
          id={`TravelRoute-${route.id}`}
          component={TravelRoute}
          schema={TravelRouteSchema}
          calculateMetadata={calculateMetadata}
          durationInFrames={30 * 60}
          fps={FPS}
          width={1080}
          height={1920}
          defaultProps={
            {
              routeTitle: route.title,
              videoFile: route.videoFile,
              audioFile: route.audioFile,
              captionsFile: `route-${route.id}-captions.json`,
              logoFile: "logo.png",
              outroFile: "ta-outro.mp4",
              carAudioFile: route.sfxFile,
              mainDurationInFrames: 30 * 60,
              outroDurationInFrames: 30 * 5,
              videoPlaybackRate: 1,
              totalDistance: route.totalDistance,
              captionStyle: route.captionStyle ?? 1,
              locationImages:
                ((route as { locationImages?: (string | null)[] }).locationImages ?? [])
                  .filter((u): u is string => typeof u === "string" && u.length > 0),
            } satisfies TravelRouteProps
          }
        />
      ))}
    </>
  );
};
