function init() {
  const STORAGE_KEY = "watchLater";
  const MAX_PER_CATEGORY = 5;

  const markCompleted = (event) => {
    try {
      if (event.mediaId != null) {
        const key = "seaqueue-completed-" + String(event.mediaId);
        if (String(event.status || "") === "COMPLETED") $store.set(key, true);
        else $store.remove(key);
      }
    } catch (_) {}
    event.next();
  };

  const removeCompleted = (event) => {
    try {
      if (event.mediaId != null) {
        const mediaId = Number(event.mediaId);
        const key = "seaqueue-completed-" + String(mediaId);
        if ($store.get(key)) {
          $store.remove(key);
          const value = $storage.get(STORAGE_KEY);
          if (Array.isArray(value)) {
            $storage.set(
              STORAGE_KEY,
              value.filter((item) => item && Number(item.id) !== mediaId),
            );
          }
        }
      }
    } catch (_) {}
    event.next();
  };

  $app.onPreUpdateEntry(markCompleted);
  $app.onPostUpdateEntry(removeCompleted);
  $app.onPreUpdateEntryProgress(markCompleted);
  $app.onPostUpdateEntryProgress(removeCompleted);

  $ui.register((ctx) => {
    const ICON_URL =
      "https://raw.githubusercontent.com/DefnoJae/SeaQueue/refs/heads/main/assets/icon.png";

    const normalizeKind = (item) => {
      if (item && item.kind) return String(item.kind);
      return "anime"; // v0.1.x entries were anime-only
    };

    const readQueue = () => {
      try {
        const value = $storage.get(STORAGE_KEY);
        if (!Array.isArray(value)) return [];
        const normalized = value
          .filter((item) => item && Number(item.id) > 0)
          .map((item) => ({
            id: Number(item.id),
            kind: normalizeKind(item),
            title: String(item.title || `Entry #${item.id}`),
            poster: String(item.poster || ""),
            year: item.year ? Number(item.year) : undefined,
            format: item.format ? String(item.format) : undefined,
            episodes: item.episodes ? Number(item.episodes) : undefined,
            chapters: item.chapters ? Number(item.chapters) : undefined,
            addedAt: Number(item.addedAt || 0),
          }))
          .sort((a, b) => b.addedAt - a.addedAt);

        const counts = { anime: 0, manga: 0, novel: 0 };
        return normalized.filter((item) => {
          const kind = item.kind in counts ? item.kind : "manga";
          item.kind = kind;
          if (counts[kind] >= MAX_PER_CATEGORY) return false;
          counts[kind] += 1;
          return true;
        });
      } catch (_) {
        return [];
      }
    };

    const mediaTitle = (media, id) => {
      if (!media) return `Entry #${id}`;
      const raw =
        media.title &&
        (media.title.english || media.title.userPreferred || media.title.romaji);
      return raw ? String(raw) : `Entry #${id}`;
    };

    const classifyManga = (media) =>
      media && String(media.format || "") === "NOVEL" ? "novel" : "manga";

    const kindLabel = (kind) =>
      kind === "anime" ? "Anime" : kind === "novel" ? "Light Novel" : "Manga";

    const toQueueItem = (media, id, kind) => ({
      id,
      kind,
      title: mediaTitle(media, id),
      poster: String(
        (media.coverImage &&
          (media.coverImage.extraLarge ||
            media.coverImage.large ||
            media.coverImage.medium)) ||
          "",
      ),
      year:
        media.startDate && media.startDate.year
          ? Number(media.startDate.year)
          : undefined,
      format: media.format ? String(media.format) : undefined,
      episodes: media.episodes ? Number(media.episodes) : undefined,
      chapters: media.chapters ? Number(media.chapters) : undefined,
      addedAt: Date.now(),
    });

    const tray = ctx.newTray({ iconUrl: ICON_URL, withContent: true });
    const currentMediaId = ctx.state(0);
    const currentKind = ctx.state("");
    const queue = ctx.state(readQueue());

    const persist = (items) => {
      const unique = items
        .filter(
          (item, index, all) =>
            all.findIndex(
              (candidate) =>
                Number(candidate.id) === Number(item.id) &&
                String(candidate.kind) === String(item.kind),
            ) === index,
        )
        .sort((a, b) => b.addedAt - a.addedAt);

      const counts = { anime: 0, manga: 0, novel: 0 };
      const next = unique.filter((item) => {
        const kind = item.kind in counts ? item.kind : "manga";
        if (counts[kind] >= MAX_PER_CATEGORY) return false;
        counts[kind] += 1;
        return true;
      });

      $storage.set(STORAGE_KEY, next);
      queue.set(next);
      tray.updateBadge({ number: next.length });
    };

    const getMedia = (id, kind) => {
      if (!id) return undefined;
      try {
        return kind === "anime"
          ? $anilist.getAnime(id)
          : $anilist.getManga(id);
      } catch (_) {
        return undefined;
      }
    };

    const openEntry = (item) => {
      if (!item || !item.id) return;
      const path = item.kind === "anime" ? "/entry" : "/manga/entry";
      ctx.screen.navigateTo(path, { id: String(item.id) });
      tray.close();
    };

    const screenState = ctx.screen.state();

    tray.onOpen(() => {
      const screen = screenState.get() || {};
      const pathname = String(screen.pathname || "");
      let kind = "";
      if (pathname === "/entry" || pathname === "/offline/entry/anime") {
        kind = "anime";
      } else if (pathname.includes("/manga/")) {
        kind = "manga";
      }

      const rawId =
        kind && screen.searchParams ? screen.searchParams.id || "" : "";
      const parsed = rawId ? parseInt(String(rawId), 10) : 0;
      const id = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

      if (id && kind === "manga") {
        const media = getMedia(id, "manga");
        kind = classifyManga(media);
      }

      currentMediaId.set(id);
      currentKind.set(kind);
      queue.set(readQueue());
      tray.updateBadge({ number: readQueue().length });
    });

    ctx.registerEventHandler("sq-add-current", () => {
      const id = currentMediaId.get();
      const kind = currentKind.get();
      if (!id || !kind) {
        ctx.toast.info("Open an anime, manga, or light novel detail page first.");
        return;
      }

      const media = getMedia(id, kind);
      if (!media) {
        ctx.toast.warning("SeaQueue could not read this entry yet.");
        return;
      }

      const items = queue.get();
      const alreadySaved = items.some(
        (item) => item.id === id && item.kind === kind,
      );
      const categoryCount = items.filter((item) => item.kind === kind).length;

      if (!alreadySaved && categoryCount >= MAX_PER_CATEGORY) {
        ctx.toast.warning(
          `${kindLabel(kind)} watch later limit reached. Remove an entry or complete one to proceed.`,
        );
        return;
      }

      const existing = items.filter(
        (item) => !(item.id === id && item.kind === kind),
      );
      persist([toQueueItem(media, id, kind), ...existing]);
      ctx.toast.success(`Added to ${kindLabel(kind)} queue`);
    });

    ctx.registerEventHandler("sq-limit-reached", () => {
      const kind = currentKind.get();
      ctx.toast.warning(
        `${kindLabel(kind)} watch later limit reached. Remove an entry or complete one to proceed.`,
      );
    });

    ctx.registerEventHandler("sq-remove-current", () => {
      const id = currentMediaId.get();
      const kind = currentKind.get();
      if (!id || !kind) return;
      persist(
        queue
          .get()
          .filter((item) => !(item.id === id && item.kind === kind)),
      );
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
      const kind = currentKind.get();
      const currentMedia = getMedia(currentId, kind);
      const currentSaved =
        currentId > 0 &&
        !!kind &&
        items.some((item) => item.id === currentId && item.kind === kind);
      const categoryCount = kind
        ? items.filter((item) => item.kind === kind).length
        : 0;
      const queueFull =
        !!kind && categoryCount >= MAX_PER_CATEGORY && !currentSaved;

      const counts = {
        anime: items.filter((x) => x.kind === "anime").length,
        manga: items.filter((x) => x.kind === "manga").length,
        novel: items.filter((x) => x.kind === "novel").length,
      };

      const header = tray.flex(
        [
          tray.flex(
            [
              tray.img(ICON_URL, {
                alt: "SeaQueue",
                width: "34px",
                height: "34px",
                style: { borderRadius: "9px" },
              }),
              tray.stack(
                [
                  tray.text("SeaQueue", {
                    style: { fontSize: "1.05rem", fontWeight: "700" },
                  }),
                  tray.text("Save it now. Watch or read it later.", {
                    style: { fontSize: "0.76rem", opacity: "0.58" },
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

      const blocks = [
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
        tray.flex(
          [
            tray.badge(`Anime ${counts.anime}/5`, { intent: "gray" }),
            tray.badge(`Manga ${counts.manga}/5`, { intent: "gray" }),
            tray.badge(`Novels ${counts.novel}/5`, { intent: "gray" }),
          ],
          { gap: 1, style: { flexWrap: "wrap" } },
        ),
      ];

      if (currentId > 0 && kind) {
        const title = mediaTitle(currentMedia, currentId);
        const poster = String(
          (currentMedia &&
            currentMedia.coverImage &&
            (currentMedia.coverImage.extraLarge ||
              currentMedia.coverImage.large ||
              currentMedia.coverImage.medium)) ||
            "",
        );

        const currentInfo = [];
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

        const metadata = [kindLabel(kind)];
        if (currentMedia && currentMedia.startDate && currentMedia.startDate.year)
          metadata.push(String(currentMedia.startDate.year));
        if (kind === "anime" && currentMedia && currentMedia.episodes)
          metadata.push(`${currentMedia.episodes} eps`);
        if (kind !== "anime" && currentMedia && currentMedia.chapters)
          metadata.push(`${currentMedia.chapters} chapters`);

        currentInfo.push(
          tray.stack(
            [
              tray.text(`CURRENT ${kindLabel(kind).toUpperCase()}`, {
                style: {
                  fontSize: "0.7rem",
                  fontWeight: "700",
                  letterSpacing: ".08em",
                  opacity: ".58",
                },
              }),
              tray.text(title, {
                style: { fontWeight: "700", fontSize: "0.95rem" },
              }),
              tray.text(metadata.join(" · "), {
                style: { opacity: "0.6", fontSize: "0.76rem" },
              }),
              tray.button(
                currentSaved
                  ? "✓ In SeaQueue · Remove"
                  : queueFull
                    ? `${kindLabel(kind)} Full (5/5)`
                    : "+ Add to SeaQueue",
                {
                  onClick: currentSaved
                    ? "sq-remove-current"
                    : queueFull
                      ? "sq-limit-reached"
                      : "sq-add-current",
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
            gap: 2,
            className: "sq-current",
            style: { alignItems: "stretch" },
          }),
        );
      } else {
        blocks.push(
          tray.alert({
            intent: "info",
            title: "Open something to save it",
            description:
              "Open an anime, manga, or light novel detail page, then open SeaQueue.",
          }),
        );
      }

      const sections = [
        { kind: "anime", label: "ANIME" },
        { kind: "manga", label: "MANGA" },
        { kind: "novel", label: "LIGHT NOVELS" },
      ];

      for (const section of sections) {
        const sectionItems = items.filter((item) => item.kind === section.kind);
        if (!sectionItems.length) continue;

        blocks.push(
          tray.text(`${section.label} · ${sectionItems.length}/5`, {
            style: {
              fontSize: ".72rem",
              fontWeight: "700",
              letterSpacing: ".08em",
              opacity: ".58",
            },
          }),
        );

        for (const item of sectionItems) {
          const meta = [];
          if (item.year) meta.push(String(item.year));
          if (item.kind === "anime" && item.episodes)
            meta.push(`${item.episodes} eps`);
          if (item.kind !== "anime" && item.chapters)
            meta.push(`${item.chapters} chapters`);

          const rowParts = [];
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
                  style: { fontWeight: "650", fontSize: ".88rem" },
                }),
                tray.text(meta.length ? meta.join(" · ") : `AniList #${item.id}`, {
                  style: { opacity: ".5", fontSize: ".72rem" },
                }),
              ],
              { gap: 1, style: { flex: "1", minWidth: "0" } },
            ),
          );

          rowParts.push(
            tray.flex(
              [
                tray.tooltip(
                  tray.button(item.kind === "anime" ? "Watch" : "Read", {
                    onClick: ctx.eventHandler(
                      `sq-open-${item.kind}-${item.id}`,
                      () => openEntry(item),
                    ),
                    size: "sm",
                    intent: "gray-subtle",
                  }),
                  {
                    text:
                      item.kind === "anime"
                        ? "Watch in Seanime"
                        : "Read in Seanime",
                  },
                ),
                tray.tooltip(
                  tray.button("✕", {
                    onClick: ctx.eventHandler(
                      `sq-remove-${item.kind}-${item.id}`,
                      () => {
                        persist(
                          queue
                            .get()
                            .filter(
                              (x) =>
                                !(
                                  x.id === item.id &&
                                  x.kind === item.kind
                                ),
                            ),
                        );
                      },
                    ),
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
      }

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
              tray.text("Save up to 5 anime, 5 manga, and 5 light novels.", {
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

      return tray.stack(blocks, { gap: 2 });
    });
  });
}
