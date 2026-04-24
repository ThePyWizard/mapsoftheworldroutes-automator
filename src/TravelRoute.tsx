import { z } from "zod";
import { AbsoluteFill, Img, Sequence, Series, staticFile, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { Video } from "@remotion/media";
import { Audio } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Montserrat";
import { Captions } from "./Captions";

const { fontFamily } = loadFont("normal", {
  weights: ["700", "900"],
  subsets: ["latin"],
});

const BIRD_FILES = ["bird_1.webm", "bird_2.webm", "bird_3.webm", "bird_4.webm"];
const BIRD_INTERVAL_SEC = 5;
const BIRD_DURATION_SEC = 3;
const BIRD_SFX_FILE = "bird-sfx.mp3";
const BIRD_SFX_VOLUME = 0.4;

export const TravelRouteSchema = z.object({
  routeTitle: z.string(),
  videoFile: z.string(),
  audioFile: z.string(),
  captionsFile: z.string(),
  logoFile: z.string(),
  outroFile: z.string(),
  carAudioFile: z.string(),
  mainDurationInFrames: z.number(),
  outroDurationInFrames: z.number(),
  videoPlaybackRate: z.number(),
  totalDistance: z.number(),
  captionStyle: z.number().min(1).max(5),
  locationImages: z.array(z.string()).default([]),
});

export type TravelRouteProps = z.infer<typeof TravelRouteSchema>;

const BirdOverlays: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();
  const intervalFrames = BIRD_INTERVAL_SEC * fps;
  const birdDurationFrames = BIRD_DURATION_SEC * fps;

  const overlays: { from: number; file: string }[] = [];
  for (let frame = 0; frame < durationInFrames; frame += intervalFrames) {
    const index = overlays.length % BIRD_FILES.length;
    overlays.push({ from: frame, file: BIRD_FILES[index] });
  }

  return (
    <>
      {overlays.map(({ from, file }, i) => (
        <Sequence key={i} from={from} durationInFrames={birdDurationFrames}>
          <AbsoluteFill>
            <Video
              src={staticFile(file)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              muted
            />
          </AbsoluteFill>
          <Audio src={staticFile(BIRD_SFX_FILE)} volume={BIRD_SFX_VOLUME} />
        </Sequence>
      ))}
    </>
  );
};

const LOCATION_IMAGE_WIDTH = 282;
const LOCATION_IMAGE_HEIGHT = 212;
const LOCATION_IMAGE_TOP = 600;

const LocationImages: React.FC<{
  locationImages: string[];
  mainDurationInFrames: number;
}> = ({ locationImages, mainDurationInFrames }) => {
  if (!locationImages.length) return null;

  const count = locationImages.length;
  const sliceFrames = Math.floor(mainDurationInFrames / count);

  return (
    <>
      {locationImages.map((url, i) => {
        if (!url) return null;
        const from = i * sliceFrames;
        const duration =
          i === count - 1 ? mainDurationInFrames - from : sliceFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <AbsoluteFill
              style={{
                justifyContent: "flex-start",
                alignItems: "center",
                paddingTop: LOCATION_IMAGE_TOP,
              }}
            >
              <Img
                src={url}
                style={{
                  width: LOCATION_IMAGE_WIDTH,
                  height: LOCATION_IMAGE_HEIGHT,
                  objectFit: "cover",
                  borderRadius: 12,
                  boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
                }}
              />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </>
  );
};

const MilesCounter: React.FC<{ totalDistance: number; mainDurationInFrames: number; videoPlaybackRate: number }> = ({ totalDistance, mainDurationInFrames, videoPlaybackRate }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const offsetFrames = Math.round((5 / videoPlaybackRate) * fps);
  const startFrame = offsetFrames;
  const endFrame = mainDurationInFrames - offsetFrames;

  if (frame < startFrame) return null;

  const miles = Math.round(
    interpolate(frame, [startFrame, endFrame], [0, totalDistance], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: "65%",
      }}
    >
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 42,
          color: "#000000",
          backgroundColor: "#FFFFFF",
          borderRadius: 24,
          padding: "10px 28px",
        }}
      >
        {miles} miles
      </div>
    </AbsoluteFill>
  );
};

const MainContent: React.FC<{
  routeTitle: string;
  videoFile: string;
  audioFile: string;
  captionsFile: string;
  logoFile: string;
  carAudioFile: string;
  videoPlaybackRate: number;
  totalDistance: number;
  mainDurationInFrames: number;
  captionStyle: number;
  locationImages: string[];
}> = ({ routeTitle, videoFile, audioFile, captionsFile, logoFile, carAudioFile, videoPlaybackRate, totalDistance, mainDurationInFrames, captionStyle, locationImages }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Layer 1: Background map animation video */}
      <AbsoluteFill>
        <Video
          src={staticFile(videoFile)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
          muted
          playbackRate={videoPlaybackRate}
        />
      </AbsoluteFill>

      {/* Layer 2: Bird video overlays (between background and text) */}
      <BirdOverlays />

      {/* Layer 3: Logo in top-right corner */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-start",
          alignItems: "flex-end",
          padding: 40,
        }}
      >
        <Img
          src={staticFile(logoFile)}
          style={{
            width: 218,
            height: 218,
            objectFit: "contain",
          }}
        />
      </AbsoluteFill>

      {/* Layer 4: Route title text */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-start",
          alignItems: "center",
          paddingTop: 200,
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            color: "#FFFFFF",
            textAlign: "center",
            textShadow:
              "0 3px 10px rgba(0,0,0,0.8), 0 0px 30px rgba(0,0,0,0.5)",
            padding: "20px 40px",
            maxWidth: "90%",
            letterSpacing: 2,
            lineHeight: 1.2,
          }}
        >
          {(() => {
            const match = routeTitle.match(/^(.+\s+to)\s+(.+)$/i);
            if (!match) return <span style={{ fontSize: 72 }}>{routeTitle}</span>;
            return (
              <>
                <div style={{ fontSize: 72 }}>{match[1]}</div>
                <div style={{ fontSize: 72 }}>{match[2]}</div>
              </>
            );
          })()}
        </div>
      </AbsoluteFill>

      {/* Layer 4b: Location images below the title, cycled across the main duration */}
      <LocationImages
        locationImages={locationImages}
        mainDurationInFrames={mainDurationInFrames}
      />

      {/* Layer 5: Voiceover audio at 150% volume */}
      <Audio src={staticFile(audioFile)} volume={1.5} />

      {/* Layer 6: Car sound at 30% volume */}
      <Audio src={staticFile(carAudioFile)} volume={0.3} />

      {/* Layer 7: Subtitles */}
      <Captions captionsFile={captionsFile} captionStyle={captionStyle} />

      {/* Layer 8: Miles counter */}
      <MilesCounter totalDistance={totalDistance} mainDurationInFrames={mainDurationInFrames} videoPlaybackRate={videoPlaybackRate} />
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ outroFile: string }> = ({ outroFile }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Video
        src={staticFile(outroFile)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </AbsoluteFill>
  );
};

export const TravelRoute: React.FC<TravelRouteProps> = ({
  routeTitle,
  videoFile,
  audioFile,
  captionsFile,
  logoFile,
  outroFile,
  carAudioFile,
  mainDurationInFrames,
  outroDurationInFrames,
  videoPlaybackRate,
  totalDistance,
  captionStyle,
  locationImages,
}) => {
  return (
    <Series>
      <Series.Sequence durationInFrames={mainDurationInFrames}>
        <MainContent
          routeTitle={routeTitle}
          videoFile={videoFile}
          audioFile={audioFile}
          captionsFile={captionsFile}
          logoFile={logoFile}
          carAudioFile={carAudioFile}
          videoPlaybackRate={videoPlaybackRate}
          totalDistance={totalDistance}
          mainDurationInFrames={mainDurationInFrames}
          captionStyle={captionStyle}
          locationImages={locationImages}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={outroDurationInFrames}>
        <Outro outroFile={outroFile} />
      </Series.Sequence>
    </Series>
  );
};
