import { navigate } from "astro:transitions/client";

type Episode = {
  slug: string;
  episodeNumber: string;
  companyName: string;
  episodeHeadline: string;
  duration: string;
  youtubeId?: string;
  videoAvailable: boolean;
  posterImage: string;
  backgroundVideo: string;
};

type InteractionSource = "pointer" | "keyboard";
type AnalyticsEventName = "episode_select" | "video_open" | "watch_on_youtube";

const EASE_OUT_EXPO = "cubic-bezier(0.19, 1, 0.22, 1)";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const saveData = Boolean((navigator as Navigator & {
  connection?: { saveData?: boolean };
}).connection?.saveData);
const warmedImages = new Map<string, Promise<void>>();

let pageController: AbortController | null = null;
let pendingAmbientSlug: string | undefined;
let ambientViewportVisible = true;
let ambientPlaybackSuppressed = false;

function pushAnalyticsEvent(
  event: AnalyticsEventName,
  parameters: Record<string, string>,
) {
  const analyticsWindow = window as Window & {
    dataLayer?: Array<Record<string, unknown>>;
  };
  analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
  analyticsWindow.dataLayer.push({ event, ...parameters });
}

function getEpisodeLinkParameters(link: HTMLElement) {
  return {
    episode_slug: link.dataset.episodeSlug || "",
    episode_number: link.dataset.episodeNumber || "",
    company_name: link.dataset.companyName || "",
  };
}

function waitForImage(image: HTMLImageElement) {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();

  const decode = typeof image.decode === "function"
    ? image.decode().catch(() => undefined)
    : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });

  return Promise.race([
    decode,
    new Promise<void>((resolve) => window.setTimeout(resolve, 2500)),
  ]);
}

function warmImage(source: string | undefined) {
  if (!source) return Promise.resolve();

  const warmed = warmedImages.get(source);
  if (warmed) return warmed;

  const existingImage = Array.from(
    document.querySelectorAll<HTMLImageElement>("[data-ambient-layer] img"),
  ).find((image) => image.getAttribute("src") === source);

  const image = existingImage ?? new Image();
  image.decoding = "async";
  if (!existingImage) image.src = source;

  const ready = waitForImage(image);
  warmedImages.set(source, ready);
  return ready;
}

function getBackgroundVideos() {
  return Array.from(
    document.querySelectorAll<HTMLVideoElement>("[data-background-video]"),
  );
}

function setBackgroundVideoPlaying(video: HTMLVideoElement, isPlaying: boolean) {
  video.closest<HTMLElement>("[data-ambient-layer]")?.classList.toggle("is-playing", isPlaying);
}

function pauseBackgroundVideo(video: HTMLVideoElement) {
  video.pause();
  setBackgroundVideoPlaying(video, false);
}

function pauseAllBackgroundVideos(except?: HTMLVideoElement) {
  getBackgroundVideos().forEach((video) => {
    if (video !== except) pauseBackgroundVideo(video);
  });
}

async function syncBackgroundPlayback() {
  const activeLayer = document.querySelector<HTMLElement>("[data-ambient-layer].is-active");
  const activeVideo = activeLayer?.querySelector<HTMLVideoElement>("[data-background-video]");

  pauseAllBackgroundVideos(activeVideo);

  const playbackAllowed = Boolean(
    activeVideo &&
    !reduceMotion.matches &&
    !saveData &&
    ambientViewportVisible &&
    !ambientPlaybackSuppressed &&
    document.visibilityState === "visible",
  );

  if (!activeVideo || !playbackAllowed) {
    if (activeVideo) pauseBackgroundVideo(activeVideo);
    return;
  }

  const source = activeVideo.dataset.videoSrc;
  if (!source) return;

  if (!activeVideo.hasAttribute("src")) {
    activeVideo.src = source;
  }

  activeVideo.muted = true;

  try {
    await activeVideo.play();
    const isStillActive = activeVideo.closest("[data-ambient-layer]")?.classList.contains("is-active");
    if (!isStillActive || reduceMotion.matches || saveData || !ambientViewportVisible || ambientPlaybackSuppressed || document.visibilityState !== "visible") {
      pauseBackgroundVideo(activeVideo);
      return;
    }
    setBackgroundVideoPlaying(activeVideo, true);
  } catch {
    pauseBackgroundVideo(activeVideo);
  }
}

function activateAmbientLayer(slug: string | undefined, instant: boolean) {
  if (!slug) return;

  const layers = document.querySelectorAll<HTMLElement>("[data-ambient-layer]");
  const nextLayer = Array.from(layers).find((layer) => layer.dataset.episodeSlug === slug);
  if (!nextLayer) return;

  if (instant) {
    const media = document.querySelector<HTMLElement>("[data-ambient-media]");
    media?.classList.add("is-instant");
    layers.forEach((layer) => layer.classList.toggle("is-active", layer === nextLayer));
    requestAnimationFrame(() => media?.classList.remove("is-instant"));
    void syncBackgroundPlayback();
    return;
  }

  nextLayer.classList.add("is-active");
  layers.forEach((layer) => {
    if (layer !== nextLayer) layer.classList.remove("is-active");
  });
  void syncBackgroundPlayback();
}

function getDestinationPoster(sourceElement: Element | undefined, pathname: string) {
  if (sourceElement instanceof HTMLElement && sourceElement.dataset.posterImage) {
    return sourceElement.dataset.posterImage;
  }

  return Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-episode-link]"))
    .find((link) => new URL(link.href).pathname === pathname)
    ?.dataset.posterImage;
}

function warmRemainingPosters() {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean };
  }).connection;
  if (connection?.saveData) return;

  document.querySelectorAll<HTMLImageElement>("[data-ambient-layer] img").forEach((image) => {
    void warmImage(image.getAttribute("src") ?? undefined);
  });
}

function getEpisodeDirection(element: Element | undefined) {
  if (!(element instanceof HTMLElement)) return undefined;
  const direction = element.dataset.episodeDirection;
  return direction === "back" || direction === "forward" ? direction : undefined;
}

document.addEventListener("astro:before-preparation", (event) => {
  const requestedDirection =
    event.info?.episodeDirection ?? getEpisodeDirection(event.sourceElement);

  if (requestedDirection === "back") event.direction = "back";
  if (requestedDirection === "forward") event.direction = "forward";

  const destinationPoster = getDestinationPoster(event.sourceElement, event.to.pathname);
  if (!destinationPoster) return;

  const loadPage = event.loader;
  event.loader = async () => {
    await Promise.all([loadPage(), warmImage(destinationPoster)]);
  };
});

document.addEventListener("astro:before-swap", (event) => {
  const dataNode = event.newDocument.querySelector<HTMLScriptElement>("#episode-data");
  if (dataNode) {
    try {
      pendingAmbientSlug = (JSON.parse(dataNode.textContent || "{}") as Episode).slug;
    } catch {
      pendingAmbientSlug = undefined;
    }
  }

  if (document.documentElement.dataset.episodeNavigation !== "instant") return;

  event.newDocument.documentElement.dataset.episodeNavigation = "instant";
  void event.viewTransition.finished.finally(() => {
    delete document.documentElement.dataset.episodeNavigation;
  });
});

document.addEventListener("astro:after-swap", () => {
  const instant =
    reduceMotion.matches ||
    document.documentElement.dataset.episodeNavigation === "instant";
  activateAmbientLayer(pendingAmbientSlug, instant);
  pendingAmbientSlug = undefined;
});

function setupExperience() {
  pageController?.abort();
  const controller = new AbortController();
  const { signal } = controller;
  pageController = controller;

  const dataNode = document.querySelector<HTMLScriptElement>("#episode-data");
  if (!dataNode) throw new Error("Build Connected episode data could not be loaded.");

  const episode = JSON.parse(dataNode.textContent || "{}") as Episode;
  const playButton = document.querySelector<HTMLButtonElement>("[data-play-button]");
  const dialog = document.querySelector<HTMLDialogElement>("[data-watch-dialog]");
  const watchModal = document.querySelector<HTMLElement>(".watch-modal");
  const closeButton = document.querySelector<HTMLButtonElement>("[data-close-dialog]");
  const youtubeFrame = document.querySelector<HTMLElement>("[data-youtube-frame]");
  const youtubePoster = document.querySelector<HTMLImageElement>("[data-youtube-poster]");
  const youtubeLink = document.querySelector<HTMLAnchorElement>("[data-youtube-link]");
  const ambientMedia = document.querySelector<HTMLElement>("[data-ambient-media]");
  const previousEpisodeLink = document.querySelector<HTMLAnchorElement>("[data-episode-previous]");
  const nextEpisodeLink = document.querySelector<HTMLAnchorElement>("[data-episode-next]");
  const episodeLinks = document.querySelectorAll<HTMLAnchorElement>("[data-episode-link]");

  let dialogRevision = 0;
  let lastPlayTrigger: HTMLElement | null = null;
  let overlayAnimations: Animation[] = [];

  ambientPlaybackSuppressed = false;
  ambientViewportVisible = true;
  const ambientObserver = ambientMedia && "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        const entry = entries[0];
        ambientViewportVisible = Boolean(entry?.isIntersecting);
        void syncBackgroundPlayback();
      }, { threshold: 0.01 })
    : null;

  if (ambientMedia) ambientObserver?.observe(ambientMedia);
  document.addEventListener("visibilitychange", () => void syncBackgroundPlayback(), { signal });
  void syncBackgroundPlayback();

  function stopAnimations(animations: Animation[], commitStyles: boolean) {
    animations.forEach((animation) => {
      if (commitStyles) {
        try {
          animation.commitStyles();
        } catch {
          // A detached animation has no styles left to commit.
        }
      }
      animation.cancel();
    });
  }

  function destroyPlayer() {
    youtubeFrame?.querySelector("iframe")?.remove();
    youtubeFrame?.classList.remove("is-ready");
  }

  function pauseAmbientMedia() {
    ambientPlaybackSuppressed = true;
    pauseAllBackgroundVideos();
  }

  function resumeAmbientMedia() {
    ambientPlaybackSuppressed = false;
    void syncBackgroundPlayback();
  }

  function cancelOverlayTransition(commitStyles: boolean) {
    stopAnimations(overlayAnimations, commitStyles);
    overlayAnimations = [];
  }

  function openDialog(trigger: HTMLElement, source: InteractionSource) {
    if (!episode.youtubeId || !episode.videoAvailable || !dialog || !watchModal || !youtubeFrame || !youtubePoster || !youtubeLink) return;

    const revision = ++dialogRevision;
    cancelOverlayTransition(false);
    lastPlayTrigger = trigger;
    youtubeLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(episode.youtubeId)}`;
    youtubePoster.src = episode.posterImage;
    youtubeFrame.classList.remove("is-ready");
    youtubeFrame.querySelector("iframe")?.remove();

    const iframe = document.createElement("iframe");
    const params = new URLSearchParams({
      autoplay: "1",
      playsinline: "1",
      controls: "1",
      rel: "0",
      enablejsapi: "1",
      origin: window.location.origin,
    });
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(episode.youtubeId)}?${params}`;
    iframe.title = `${episode.episodeNumber}: ${episode.episodeHeadline}`;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    iframe.addEventListener("load", () => {
      if (revision === dialogRevision && dialog.open) youtubeFrame.classList.add("is-ready");
    }, { signal });
    youtubeFrame.append(iframe);

    pauseAmbientMedia();
    dialog.showModal();
    closeButton?.focus();
    pushAnalyticsEvent("video_open", {
      episode_slug: episode.slug,
      episode_number: episode.episodeNumber,
      company_name: episode.companyName,
      interaction_method: source,
    });

    if (source === "keyboard") return;

    const backdropAnimation = dialog.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduceMotion.matches ? 180 : 240,
      easing: EASE_OUT_EXPO,
      fill: "both",
    });
    overlayAnimations = [backdropAnimation];

    if (!reduceMotion.matches) {
      overlayAnimations.push(
        watchModal.animate(
          [
            { opacity: 0, transform: "scale(0.98) translateY(8px)" },
            { opacity: 1, transform: "scale(1) translateY(0)" },
          ],
          { duration: 240, easing: EASE_OUT_EXPO, fill: "both" },
        ),
      );
    }

    void Promise.allSettled(overlayAnimations.map((animation) => animation.finished)).then(() => {
      if (revision === dialogRevision) cancelOverlayTransition(false);
    });
  }

  async function closeDialog(source: InteractionSource) {
    if (!dialog?.open || !watchModal) return;

    const revision = ++dialogRevision;
    cancelOverlayTransition(true);

    if (source === "keyboard") {
      dialog.close();
      return;
    }

    const backdropAnimation = dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 150,
      easing: EASE_OUT_EXPO,
      fill: "both",
    });
    overlayAnimations = [backdropAnimation];

    if (!reduceMotion.matches) {
      overlayAnimations.push(
        watchModal.animate(
          [
            { opacity: 1, transform: "scale(1) translateY(0)" },
            { opacity: 0, transform: "scale(0.985) translateY(4px)" },
          ],
          { duration: 150, easing: EASE_OUT_EXPO, fill: "both" },
        ),
      );
    }

    await Promise.allSettled(overlayAnimations.map((animation) => animation.finished));
    if (revision === dialogRevision && dialog.open) dialog.close();
  }

  playButton?.addEventListener("click", () => openDialog(playButton, "pointer"), { signal });
  closeButton?.addEventListener("click", () => void closeDialog("pointer"), { signal });
  youtubeLink?.addEventListener("click", (event) => {
    pushAnalyticsEvent("watch_on_youtube", {
      episode_slug: episode.slug,
      episode_number: episode.episodeNumber,
      company_name: episode.companyName,
      interaction_method: event.detail === 0 ? "keyboard" : "pointer",
    });
  }, { signal });

  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) void closeDialog("pointer");
  }, { signal });

  dialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    void closeDialog("keyboard");
  }, { signal });

  dialog?.addEventListener("close", () => {
    cancelOverlayTransition(false);
    destroyPlayer();
    resumeAmbientMedia();
    lastPlayTrigger?.focus({ preventScroll: true });
  }, { signal });

  episodeLinks.forEach((link) => {
    const warmDestination = () => warmImage(link.dataset.posterImage);
    link.addEventListener("pointerenter", warmDestination, { signal });
    link.addEventListener("focus", warmDestination, { signal });
    if (link.dataset.episodeDirection === "current") {
      link.addEventListener("click", (event) => event.preventDefault(), { signal });
    } else {
      link.addEventListener("click", (event) => {
        pushAnalyticsEvent("episode_select", {
          ...getEpisodeLinkParameters(link),
          interaction_method: event.detail === 0 ? "keyboard" : "pointer",
        });
      }, { signal });
    }
  });

  void warmImage(episode.posterImage);
  void warmImage(previousEpisodeLink?.dataset.posterImage);
  void warmImage(nextEpisodeLink?.dataset.posterImage);

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  };
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(warmRemainingPosters, { timeout: 1200 });
  } else {
    window.setTimeout(warmRemainingPosters, 300);
  }

  window.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    const isTyping = Boolean(target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
    if (event.defaultPrevented || isTyping || event.metaKey || event.ctrlKey || event.altKey) return;

    if (dialog?.open) {
      if (event.key === "Escape") {
        event.preventDefault();
        void closeDialog("keyboard");
      }
      return;
    }

    const destination = event.key === "ArrowLeft"
      ? previousEpisodeLink
      : event.key === "ArrowRight"
        ? nextEpisodeLink
        : null;

    if (destination) {
      event.preventDefault();
      if (event.repeat) return;

      const episodeDirection = destination.dataset.episodeDirection;
      pushAnalyticsEvent("episode_select", {
        ...getEpisodeLinkParameters(destination),
        interaction_method: "keyboard",
      });
      document.documentElement.dataset.episodeNavigation = "instant";
      void navigate(destination.href, {
        history: "auto",
        sourceElement: destination,
        info: { episodeDirection, episodeSource: "keyboard" },
      }).catch(() => {
        delete document.documentElement.dataset.episodeNavigation;
      });
      return;
    }

    if (event.key.toLowerCase() === "p" && playButton && !playButton.disabled) {
      event.preventDefault();
      openDialog(playButton, "keyboard");
    }
  }, { signal });

  reduceMotion.addEventListener("change", () => {
    void syncBackgroundPlayback();
  }, { signal });

  signal.addEventListener("abort", () => {
    ambientObserver?.disconnect();
    ++dialogRevision;
    cancelOverlayTransition(false);
    destroyPlayer();
  }, { once: true });
}

document.addEventListener("astro:page-load", setupExperience);
