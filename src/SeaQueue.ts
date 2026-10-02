type QueueItem = {
  id: number;
  title: string;
  poster: string;
  year?: number;
  format?: string;
  episodes?: number;
  addedAt: number;
};

const STORAGE_KEY = "watchLater";
const MAX_QUEUE_SIZE = 250;

function readQueue(): QueueItem[] {
  try {
    const value = $storage.get<QueueItem[]>(STORAGE_KEY);
    if (!Array.isArray(value)) return [];

    return value
      .filter((item) => item && Number(item.id) > 0)
      .map((item) => ({
        id: Number(item.id),
        title: String(item.title || `Anime #${item.id}`),
        poster: String(item.poster || ""),
        year: item.year ? Number(item.year) : undefined,
        format: item.format ? String(item.format) : undefined,
        episodes: item.episodes ? Number(item.episodes) : undefined,
        addedAt: Number(item.addedAt || 0),
      }))
      .sort((a, b) => b.addedAt - a.addedAt);
  } catch (_) {
    return [];
  }
}

function mediaTitle(media: $app.AL_BaseAnime | undefined, id: number): string {
  if (!media) return `Anime #${id}`;
  return (
    media.title?.english ||
    media.title?.userPreferred ||
    media.title?.romaji ||
    `Anime #${id}`
  );
}

function toQueueItem(media: $app.AL_BaseAnime, id: number): QueueItem {
  return {
    id,
    title: mediaTitle(media, id),
    poster: String(media.coverImage?.large || media.coverImage?.medium || ""),
    year: media.startDate?.year || undefined,
    format: media.format ? String(media.format) : undefined,
    episodes: media.episodes || undefined,
    addedAt: Date.now(),
  };
}

export function init() {
  $ui.register((ctx) => {
    const tray = ctx.newTray({
      iconUrl:
        "https://raw.githubusercontent.com/DefnoJae/SeaQueue/refs/heads/main/assets/icon.svg",
      withContent: true,
    });

    const currentMediaId = ctx.state<number>(0);
    const queue = ctx.state<QueueItem[]>(readQueue());

    const persist = (items: QueueItem[]) => {
      const next = items
        .filter((item, index, all) =>
          all.findIndex((candidate) => candidate.id === item.id) === index,
        )
        .sort((a, b) => b.addedAt - a.addedAt)
        .slice(0, MAX_QUEUE_SIZE);

      $storage.set(STORAGE_KEY, next);
      queue.set(next);
      tray.updateBadge({ number: next.length });
    };

    const getAnime = (id: number): $app.AL_BaseAnime | undefined => {
      if (!id) return undefined;
      try {
        return $anilist.getAnime(id);
      } catch (_) {
        return undefined;
      }
    };

    const openAnime = (id: number) => {
      if (!id) return;
      ctx.screen.navigateTo("/entry", { id: String(id) });
      tray.close();
    };

    ctx.screen.onNavigate((event) => {
      const pathname = String(event.pathname || "");
      const isAnimeEntry =
        pathname === "/entry" || pathname === "/offline/entry/anime";
      const rawId = isAnimeEntry ? event.searchParams?.id : "";
      const parsed = rawId ? Number.parseInt(String(rawId), 10) : 0;
      currentMediaId.set(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
    });
    ctx.screen.loadCurrent();

    ctx.registerEventHandler("sq-add-current", () => {
      const id = currentMediaId.get();
      if (!id) {
        ctx.toast.info("Open an anime detail page first.");
        return;
      }

      const media = getAnime(id);
      if (!media) {
        ctx.toast.warning("SeaQueue could not read this anime yet.");
        return;
      }

      const existing = queue.get().filter((item) => item.id !== id);
      persist([toQueueItem(media, id), ...existing]);
      ctx.toast.success("Added to SeaQueue");
    });

    ctx.registerEventHandler("sq-remove-current", () => {
      const id = currentMediaId.get();
      if (!id) return;
      persist(queue.get().filter((item) => item.id !== id));
      ctx.toast.info("Removed from SeaQueue");
    });

    ctx.registerEventHandler("sq-clear-all", () => {
      persist([]);
      ctx.toast.info("SeaQueue cleared");
    });

    tray.updateBadge({ number: queue.get().length });

    tray.render(() => {
      const items = queue.get();
      const currentId = currentMediaId.get();
      const currentMedia = getAnime(currentId);
      const currentSaved =
        currentId > 0 && items.some((item) => item.id === currentId);

      const header = tray.flex(
        [
          tray.flex(
            [
              tray.img(
                "https://raw.githubusercontent.com/DefnoJae/SeaQueue/refs/heads/main/assets/icon.svg",
                {
                  alt: "SeaQueue",
                  width: "34px",
                  height: "34px",
                  style: { borderRadius: "9px" },
                },
              ),
              tray.stack(
                [
                  tray.text("SeaQueue", {
                    style: {
                      fontSize: "1.05rem",
                      fontWeight: "700",
                    },
                  }),
                  tray.text("Save it now. Watch it later.", {
                    style: {
                      fontSize: "0.76rem",
                      opacity: "0.58",
                    },
                  }),
                ],
                { gap: 0 },
              ),
            ],
            { gap: 2, style: { alignItems: "center" } },
          ),
          tray.badge(String(items.length), {
            intent: items.length ? "primary" : "gray",
            size: "md",
          }),
        ],
        {
          style: {
            justifyContent: "space-between",
            alignItems: "center",
          },
        },
      );

      const blocks: unknown[] = [
        tray.css(`
          .sq-current {
            border: 1px solid rgba(255,255,255,.10);
            background: rgba(255,255,255,.035);
            border-radius: 12px;
            padding: 12px;
          }
          .sq-row {
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 10px;
            padding: 8px;
            background: rgba(255,255,255,.025);
          }
        `),
        header,
      ];

      if (currentId > 0) {
        const title = mediaTitle(currentMedia, currentId);
        const poster = String(
          currentMedia?.coverImage?.large ||
            currentMedia?.coverImage?.medium ||
            "",
        );

        const currentInfo: unknown[] = [];

        if (poster) {
          currentInfo.push(
            tray.img(poster, {
              alt: title,
              width: "74px",
              height: "104px",
              style: {
                objectFit: "cover",
                borderRadius: "8px",
                flexShrink: "0",
              },
            }),
          );
        }

        const metadata: string[] = [];
        if (currentMedia?.format) metadata.push(String(currentMedia.format));
        if (currentMedia?.startDate?.year)
          metadata.push(String(currentMedia.startDate.year));
        if (currentMedia?.episodes)
          metadata.push(`${currentMedia.episodes} eps`);

        currentInfo.push(
          tray.stack(
            [
              tray.text("CURRENT PAGE", {
                style: {
                  fontSize: "0.7rem",
                  fontWeight: "700",
                  letterSpacing: ".08em",
                  opacity: ".58",
                },
              }),
              tray.text(title, {
                style: {
                  fontWeight: "700",
                  fontSize: "0.95rem",
                },
              }),
              metadata.length
                ? tray.text(metadata.join(" · "), {
                    style: {
                      opacity: "0.6",
                      fontSize: "0.76rem",
                    },
                  })
                : tray.text("Anime detail page", {
                    style: {
                      opacity: "0.6",
                      fontSize: "0.76rem",
                    },
                  }),
              tray.button(
                currentSaved ? "✓ In SeaQueue · Remove" : "+ Add to SeaQueue",
                {
                  onClick: currentSaved ? "sq-remove-current" : "sq-add-current",
                  intent: currentSaved ? "gray-subtle" : "primary",
                  size: "md",
                  style: { width: "100%" },
                },
              ),
            ],
            { gap: 2, style: { flex: "1", minWidth: "0" } },
          ),
        );

        blocks.push(
          tray.flex(currentInfo, {
            gap: 3,
            className: "sq-current",
            style: { alignItems: "stretch" },
          }),
        );
      } else {
        blocks.push(
          tray.alert({
            intent: "info",
            title: "Open an anime to save it",
            description:
              "Go to any anime detail page, then open SeaQueue. The current anime will appear here automatically.",
          }),
        );
      }

      blocks.push(
        tray.flex(
          [
            tray.text("WATCH LATER", {
              style: {
                fontSize: "0.72rem",
                fontWeight: "700",
                letterSpacing: ".08em",
                opacity: ".62",
                flex: "1",
              },
            }),
            tray.text(`${items.length} saved`, {
              style: { fontSize: "0.75rem", opacity: ".5" },
            }),
          ],
          { style: { alignItems: "center" } },
        ),
      );

      if (!items.length) {
        blocks.push(
          tray.div(
            [
              tray.text("Your SeaQueue is empty.", {
                style: {
                  textAlign: "center",
                  opacity: ".7",
                  fontWeight: "600",
                },
              }),
              tray.text("Anime you save from detail pages will appear here.", {
                style: {
                  textAlign: "center",
                  opacity: ".46",
                  fontSize: ".78rem",
                },
              }),
            ],
            {
              style: {
                border: "1px dashed rgba(255,255,255,.10)",
                borderRadius: "10px",
                padding: "18px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              },
            },
          ),
        );
      } else {
        for (const item of items) {
          const meta: string[] = [];
          if (item.format) meta.push(item.format);
          if (item.year) meta.push(String(item.year));
          if (item.episodes) meta.push(`${item.episodes} eps`);

          const rowParts: unknown[] = [];
          if (item.poster) {
            rowParts.push(
              tray.img(item.poster, {
                alt: item.title,
                width: "52px",
                height: "72px",
                style: {
                  objectFit: "cover",
                  borderRadius: "7px",
                  flexShrink: "0",
                },
              }),
            );
          }

          rowParts.push(
            tray.stack(
              [
                tray.text(item.title, {
                  style: {
                    fontWeight: "650",
                    fontSize: ".88rem",
                  },
                }),
                meta.length
                  ? tray.text(meta.join(" · "), {
                      style: {
                        opacity: ".5",
                        fontSize: ".72rem",
                      },
                    })
                  : tray.text(`AniList #${item.id}`, {
                      style: {
                        opacity: ".5",
                        fontSize: ".72rem",
                      },
                    }),
              ],
              { gap: 1, style: { flex: "1", minWidth: "0" } },
            ),
          );

          rowParts.push(
            tray.flex(
              [
                tray.tooltip(
                  tray.button("Open →", {
                    onClick: ctx.eventHandler(`sq-open-${item.id}`, () =>
                      openAnime(item.id),
                    ),
                    size: "sm",
                    intent: "gray-subtle",
                  }),
                  { text: "Open anime in Seanime" },
                ),
                tray.tooltip(
                  tray.button("✕", {
                    onClick: ctx.eventHandler(`sq-remove-${item.id}`, () => {
                      persist(queue.get().filter((x) => x.id !== item.id));
                    }),
                    size: "sm",
                    intent: "alert-subtle",
                  }),
                  { text: "Remove from SeaQueue" },
                ),
              ],
              { gap: 1, style: { alignItems: "center" } },
            ),
          );

          blocks.push(
            tray.flex(rowParts, {
              gap: 2,
              className: "sq-row",
              style: { alignItems: "center" },
            }),
          );
        }

        blocks.push(
          tray.flex(
            [
              tray.button("Clear SeaQueue", {
                onClick: "sq-clear-all",
                size: "sm",
                intent: "alert-subtle",
              }),
            ],
            { style: { justifyContent: "center" } },
          ),
        );
      }

      return tray.stack(blocks, { gap: 3 });
    });
  });
}
