import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useDelayRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Caption, TikTokPage } from "@remotion/captions";
import { createTikTokStyleCaptions } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/Montserrat";

const { fontFamily } = loadFont("normal", {
  weights: ["700", "900"],
  subsets: ["latin"],
});

const SWITCH_CAPTIONS_EVERY_MS = 1200;

type StyleConfig = {
  containerStyle: React.CSSProperties;
  textStyle: React.CSSProperties;
  activeColor: string;
  inactiveColor: string;
  wrapperStyle: React.CSSProperties;
};

const STYLES: Record<number, StyleConfig> = {
  // Style 1: Classic TikTok — dark pill, gold highlight
  1: {
    wrapperStyle: {
      justifyContent: "center",
      alignItems: "center",
      marginTop: "35%",
    },
    containerStyle: {
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      padding: "14px 28px",
      borderRadius: 10,
      maxWidth: "85%",
    },
    textStyle: {
      fontFamily,
      fontSize: 42,
      fontWeight: 700,
      textAlign: "center" as const,
      whiteSpace: "pre" as const,
      lineHeight: 1.3,
      textShadow: "0 2px 6px rgba(0,0,0,0.9)",
    },
    activeColor: "#FFD700",
    inactiveColor: "#FFFFFF",
  },

  // Style 2: Neon Pop — no background, large bold, cyan highlight with glow
  2: {
    wrapperStyle: {
      justifyContent: "center",
      alignItems: "center",
      marginTop: "35%",
    },
    containerStyle: {
      padding: "14px 28px",
      maxWidth: "85%",
    },
    textStyle: {
      fontFamily,
      fontSize: 52,
      fontWeight: 900,
      textAlign: "center" as const,
      whiteSpace: "pre" as const,
      lineHeight: 1.2,
      textShadow:
        "0 0 10px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.8), 0 4px 8px rgba(0,0,0,0.9)",
      textTransform: "uppercase" as const,
      letterSpacing: 2,
    },
    activeColor: "#00F5FF",
    inactiveColor: "#FFFFFF",
  },

  // Style 3: Boxed Word — each active word gets a solid colored box
  3: {
    wrapperStyle: {
      justifyContent: "center",
      alignItems: "center",
      marginTop: "35%",
    },
    containerStyle: {
      padding: "14px 28px",
      maxWidth: "85%",
    },
    textStyle: {
      fontFamily,
      fontSize: 46,
      fontWeight: 900,
      textAlign: "center" as const,
      whiteSpace: "pre" as const,
      lineHeight: 1.5,
      textShadow: "0 2px 8px rgba(0,0,0,0.9)",
    },
    activeColor: "#FFFFFF",
    inactiveColor: "#FFFFFF",
  },

  // Style 4: Gradient Bar — wide bottom bar, warm orange highlight
  4: {
    wrapperStyle: {
      justifyContent: "flex-end",
      alignItems: "center",
      paddingBottom: "22%",
    },
    containerStyle: {
      background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 100%)",
      padding: "24px 36px",
      width: "100%",
    },
    textStyle: {
      fontFamily,
      fontSize: 44,
      fontWeight: 700,
      textAlign: "center" as const,
      whiteSpace: "pre" as const,
      lineHeight: 1.3,
    },
    activeColor: "#FF6B35",
    inactiveColor: "#FFFFFF",
  },

  // Style 5: Minimal Clean — subtle underline style, green highlight
  5: {
    wrapperStyle: {
      justifyContent: "center",
      alignItems: "center",
      marginTop: "35%",
    },
    containerStyle: {
      backgroundColor: "rgba(255, 255, 255, 0.95)",
      padding: "16px 32px",
      borderRadius: 20,
      maxWidth: "85%",
    },
    textStyle: {
      fontFamily,
      fontSize: 40,
      fontWeight: 700,
      textAlign: "center" as const,
      whiteSpace: "pre" as const,
      lineHeight: 1.4,
    },
    activeColor: "#10B981",
    inactiveColor: "#1A1A1A",
  },
};

const CaptionPage: React.FC<{ page: TikTokPage; captionStyle: number }> = ({
  page,
  captionStyle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentTimeMs = (frame / fps) * 1000;
  const absoluteTimeMs = page.startMs + currentTimeMs;

  const style = STYLES[captionStyle] ?? STYLES[1];

  return (
    <AbsoluteFill style={style.wrapperStyle}>
      <div style={style.containerStyle}>
        <div style={style.textStyle}>
          {page.tokens.map((token) => {
            const isActive =
              token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;

            // Style 3: active word gets a colored box behind it
            if (captionStyle === 3) {
              return (
                <span
                  key={token.fromMs}
                  style={{
                    color: isActive ? "#FFFFFF" : style.inactiveColor,
                    backgroundColor: isActive ? "#E11D48" : "transparent",
                    borderRadius: isActive ? 6 : 0,
                    padding: isActive ? "2px 6px" : "2px 0",
                    transition: "none",
                  }}
                >
                  {token.text}
                </span>
              );
            }

            return (
              <span
                key={token.fromMs}
                style={{
                  color: isActive ? style.activeColor : style.inactiveColor,
                  transition: "none",
                }}
              >
                {token.text}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Captions: React.FC<{
  captionsFile: string;
  captionStyle: number;
}> = ({ captionsFile, captionStyle }) => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Loading captions..."));
  const { fps } = useVideoConfig();

  const fetchCaptions = useCallback(async () => {
    try {
      const response = await fetch(staticFile(captionsFile));
      const data = await response.json();
      setCaptions(data);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [captionsFile, continueRender, cancelRender, handle]);

  useEffect(() => {
    fetchCaptions();
  }, [fetchCaptions]);

  const pages = useMemo(() => {
    if (!captions) return [];
    const { pages } = createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
    });
    return pages;
  }, [captions]);

  if (!captions) {
    return null;
  }

  return (
    <AbsoluteFill>
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = (page.startMs / 1000) * fps;
        const endFrame = Math.min(
          nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
          startFrame + (SWITCH_CAPTIONS_EVERY_MS / 1000) * fps,
        );
        const durationInFrames = endFrame - startFrame;

        if (durationInFrames <= 0) {
          return null;
        }

        return (
          <Sequence
            key={index}
            from={startFrame}
            durationInFrames={durationInFrames}
          >
            <CaptionPage page={page} captionStyle={captionStyle} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
