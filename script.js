// reading progress, chapter unlock/nav, footnotes 
document.addEventListener("DOMContentLoaded", () => {
    const mqMobile = window.matchMedia("(max-width: 900px)");
    const mobile = () => mqMobile.matches;
    const scrollBehav = () => (mobile() ? "auto" : "smooth"); // for scrollTo({ behavior: … }) if you add it

    // main column shell, essay stack, chapters vs abstract, progress strip, essay nav accordion
    const shell = document.querySelector(".column-main-inner");
    const scrollEl = document.getElementById("essay-scroll");
    const chaptersEl = document.getElementById("chapters");
    const abstractEl = document.getElementById("abstract-wrap");
    const progressRoot = document.getElementById("read-progress");
    const progressFill = progressRoot?.querySelector(".progress-fill");
    const menuToggle = document.getElementById("menu-toggle");
    const menuPanel = document.getElementById("essay-menu");

    // scroll container: inner wrapper on mobile (full column scroll), essay column on desktop.
    const scrollRoot = () => (mobile() && shell ? shell : scrollEl || shell);

    // cached heights for progress bar (invalidated on resize / font load / layout change)
    let measureCache = { w: -1, full: 0, abstract: 0, sectionHeights: [] };
    const invalidateMeasure = () => {
        measureCache.w = -1;
    };

    // invisible measuring box at essay width (clone content, read scrollHeight, remove)
    const offscreenHost = (w) => {
        const el = document.createElement("div");
        el.setAttribute("aria-hidden", "true");
        el.style.cssText = `position:absolute;left:-9999px;top:0;width:${w}px;visibility:hidden;pointer-events:none`;
        return el;
    };

    // essay body section ids and how far the reader must have “reached” to open each (linear unlock)
    const SECTIONS = ["part-1", "part-2", "part-3", "part-4", "contacts", "sources"];
    const UNLOCK_AT = {
        "part-1": 0,
        "part-2": 1,
        "part-3": 2,
        "part-4": 3,
        contacts: 4,
        sources: 4,
    };
    // nav targets that should keep the Essay dropdown open when active
    const ESSAY_SUBMENU_NAV = new Set(["part-1", "part-2", "part-3", "part-4", "contacts"]);

    // total scrollable length + per-section heights 
    function readMeasures() {
        if (!scrollEl) return { full: 1, abstract: 0, sectionHeights: [] };
        const w = scrollEl.clientWidth;
        if (measureCache.w === w && measureCache.full > 0 && measureCache.sectionHeights.length) {
            return measureCache;
        }

        const absHost = offscreenHost(w);
        if (abstractEl) {
            const c = abstractEl.cloneNode(true);
            c.removeAttribute("hidden");
            absHost.appendChild(c);
        }
        document.body.appendChild(absHost);
        const abstractH = absHost.scrollHeight;
        document.body.removeChild(absHost);

        const sectionHeights = SECTIONS.map((id) => {
            const src = document.getElementById(id);
            if (!src) return 0;
            const h = offscreenHost(w);
            const c = src.cloneNode(true);
            c.classList.remove("locked", "off");
            c.removeAttribute("hidden");
            h.appendChild(c);
            document.body.appendChild(h);
            const sh = h.scrollHeight;
            document.body.removeChild(h);
            return sh;
        });

        const full = abstractH + sectionHeights.reduce((a, b) => a + b, 0);
        measureCache = { w, full, abstract: abstractH, sectionHeights };
        return measureCache;
    }

    // ——— footnotes: DOM placement + visibility (.is-on) ———
    const noteLinks = document.querySelectorAll(".note-link");
    const ioThresholds = Array.from({ length: 21 }, (_, i) => i / 20);
    const notePlaced = new Map();

    // desktop: notes live in refs column
    // mobile: move each .note under its .note-link paragraph
    function placeNotes() {
        document.querySelectorAll(".note").forEach((note) => {
            if (!notePlaced.has(note)) {
                notePlaced.set(note, { parent: note.parentNode, next: note.nextSibling });
            }
            if (mobile()) {
                const id = note.dataset.noteId;
                const link = document.querySelector(`.note-link[data-note-target="${id}"]`);
                const host = link?.closest("p") ?? link?.closest("blockquote");
                if (host) host.after(note);
            } else {
                const { parent, next } = notePlaced.get(note);
                if (next?.parentNode === parent) parent.insertBefore(note, next);
                else parent.appendChild(note);
            }
        });
    }

    // show one note (or none)
    function setActiveNote(id) {
        if (!id) {
            lastIoNoteId = null;
            clearNotes();
            return;
        }
        document.querySelectorAll(".note").forEach((n) => {
            n.classList.toggle("is-on", n.dataset.noteId === id);
        });
    }

    // click: toggle that note off if already open; otherwise show only this one
    function highlightNote(id) {
        if (!id) return;
        const target = document.querySelector(`.note[data-note-id="${id}"]`);
        if (target?.classList.contains("is-on")) {
            target.classList.remove("is-on");
            lastIoNoteId = null;
            return;
        }
        lastIoNoteId = id;
        setActiveNote(id);
    }

    // hide all refs 
    function clearNotes() {
        document.querySelectorAll(".note").forEach((n) => n.classList.remove("is-on"));
    }

    // inline citation taps: toggle note; mobile also nudges the note into view
    noteLinks.forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const id = link.dataset.noteTarget;
            if (!id) return;
            highlightNote(id);
            const node = document.querySelector(`.note[data-note-id="${id}"]`);
            if (node && mobile() && node.classList.contains("is-on")) {
                node.scrollIntoView({ block: "nearest" });
            }
        });
    });

    // desktop: IO-driven ref — sticky forward: keep showing a note until a later citation is visible or user clicks
    let noteIo = null;
    const noteRatios = new Map();
    let pickRaf = null;
    let lastIoNoteId = null;

    function pickBestAmong(entries) {
        let best = entries[0];
        for (const x of entries) {
            if (x.r > best.r + 1e-6) best = x;
            else if (Math.abs(x.r - best.r) <= 1e-6 && x.i > best.i) best = x;
        }
        return best;
    }

    function pickNote() {
        if (mobile()) return;

        const links = Array.from(noteLinks);
        const visible = [];
        for (let i = 0; i < links.length; i++) {
            const r = noteRatios.get(links[i]);
            if (r != null && r > 0) visible.push({ link: links[i], i, r });
        }

        if (visible.length === 0) {
            if (lastIoNoteId) setActiveNote(lastIoNoteId);
            else {
                lastIoNoteId = null;
                clearNotes();
            }
            return;
        }

        if (!lastIoNoteId) {
            const chosen = pickBestAmong(visible);
            lastIoNoteId = chosen.link.dataset.noteTarget;
            setActiveNote(lastIoNoteId);
            return;
        }

        const anchorIdx = links.findIndex((l) => l.dataset.noteTarget === lastIoNoteId);
        if (anchorIdx < 0) {
            const chosen = pickBestAmong(visible);
            lastIoNoteId = chosen.link.dataset.noteTarget;
            setActiveNote(lastIoNoteId);
            return;
        }

        const afterAnchor = visible.filter((x) => x.i > anchorIdx);
        if (afterAnchor.length > 0) {
            const chosen = pickBestAmong(afterAnchor);
            lastIoNoteId = chosen.link.dataset.noteTarget;
            setActiveNote(lastIoNoteId);
            return;
        }

        setActiveNote(lastIoNoteId);
    }

    // coalesce IO callbacks to one pick per frame (avoids flicker)
    function schedulePick() {
        if (mobile()) return;
        if (pickRaf != null) cancelAnimationFrame(pickRaf);
        pickRaf = requestAnimationFrame(() => {
            pickRaf = null;
            pickNote();
        });
    }

    // tear down footnote observer (mobile or before re-observe)
    function stopNoteIo() {
        noteIo?.disconnect();
        noteIo = null;
        noteRatios.clear();
        lastIoNoteId = null;
    }

    // observe .note-link elements in the essay column; ratios feed pickNote → setActiveNote
    function startNoteIo() {
        const root = scrollRoot();
        if (!root || noteLinks.length === 0) return;
        stopNoteIo();
        if (mobile()) return;
        noteIo = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.intersectionRatio > 0) noteRatios.set(e.target, e.intersectionRatio);
                    else noteRatios.delete(e.target);
                });
                schedulePick();
            },
            { root, threshold: ioThresholds, rootMargin: "0px" }
        );
        noteLinks.forEach((l) => noteIo.observe(l));
        schedulePick();
    }

    // crossing the breakpoint: remeasure, move footnotes, swap scroll root + IO
    mqMobile.addEventListener("change", () => {
        invalidateMeasure();
        placeNotes();
        bindScroll();
        if (mobile()) stopNoteIo();
        else startNoteIo();
        scheduleChapter();
    });

    // wait two frames so layout (e.g. hidden → shown) has settled before measuring.
    const raf2 = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

    // ——— Chapters: linear unlock, visible section, nav chrome ———
    let unlocked = 0;
    let visibleId = "part-1";

    // essay nav item is locked until reader has opened far enough (linear progression)
    const navLocked = (nav) => {
        if (chaptersEl?.hidden) return false;
        const need = UNLOCK_AT[nav] ?? -1;
        return need >= 0 && unlocked < need;
    };

    // .locked / .off on sections: only one “on” chapter visible when essay is open
    function paintChapters() {
        if (!chaptersEl || chaptersEl.hidden) return;
        SECTIONS.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const need = UNLOCK_AT[id];
            if (need === undefined) return;
            const locked = unlocked < need;
            el.classList.toggle("locked", locked);
            el.classList.toggle("off", !locked && visibleId !== id);
        });
    }

    // re-apply chapter classes, sync scroll target, invalidate progress measurements
    function refresh() {
        paintChapters();
        if (chaptersEl && !chaptersEl.hidden) setChapter(visibleId);
        else syncNav();
        invalidateMeasure();
        requestAnimationFrame(updateBar);
    }

    // essay submenu: aria-expanded + #essay-menu hidden toggle
    menuToggle?.addEventListener("click", () => {
        const open = menuToggle.getAttribute("aria-expanded") === "true";
        menuToggle.setAttribute("aria-expanded", String(!open));
        if (menuPanel) menuPanel.hidden = open;
    });

    // “essay” accordion in the nav (numbered items / thank you)
    function showChapters() {
        if (!chaptersEl || !chaptersEl.hidden) return;
        unlocked = 0;
        visibleId = "part-1";
        chaptersEl.hidden = false;
        if (abstractEl) abstractEl.hidden = true;
        raf2(() => {
            placeNotes();
            scheduleChapter();
            startNoteIo();
        });
    }

    // data-chapter on <html> drives .is-active on nav buttons
    function setChapter(ch) {
        document.documentElement.dataset.chapter = ch;
        syncNav();
    }

    // helpers for nav clicks (Abstract / Sources close the essay submenu)
    const collapseEssaySubmenu = () => {
        if (menuPanel) menuPanel.hidden = true;
        menuToggle?.setAttribute("aria-expanded", "false");
    };

    const expandEssaySubmenu = () => {
        if (!menuPanel || !menuToggle) return;
        menuPanel.hidden = false;
        menuToggle.setAttribute("aria-expanded", "true");
    };

    const navBtns = document.querySelectorAll(".nav-btn");

    // reflect html[data-chapter]; fade buttons that point at not-yet-unlocked sections
    function syncNav() {
        const ch = document.documentElement.dataset.chapter;
        navBtns.forEach((btn) => {
            const nav = btn.dataset.nav;
            btn.classList.toggle("is-active", nav === ch);
            btn.classList.toggle("is-faded", Boolean(nav && navLocked(nav)));
        });
    }

    // sidebar: Abstract vs essay parts, bump unlock level, jump scroll to top of essay column
    navBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const nav = btn.dataset.nav;
            if (!nav) return;

            if (nav === "abstract") {
                unlocked = 0;
                collapseEssaySubmenu();
                if (chaptersEl && !chaptersEl.hidden) {
                    chaptersEl.hidden = true;
                    if (abstractEl) abstractEl.hidden = false;
                    refresh();
                }
                const r = scrollRoot();
                if (r) r.scrollTop = 0;
                setChapter("abstract");
                raf2(() => {
                    startNoteIo();
                    scheduleChapter();
                });
                return;
            }

            if (chaptersEl?.hidden) showChapters();

            if (nav in UNLOCK_AT) {
                const need = UNLOCK_AT[nav];
                if (need > unlocked) unlocked = need;
            }

            if (!(nav in UNLOCK_AT)) return;
            if (navLocked(nav)) return;

            if (nav === "sources") collapseEssaySubmenu();

            visibleId = nav;
            refresh();

            if (ESSAY_SUBMENU_NAV.has(nav)) expandEssaySubmenu();

            const r = scrollRoot();
            if (r) r.scrollTop = 0;
        });
    });

    // programmatic nav (footer buttons) — same as clicking the matching sidebar item
    const triggerNav = (nav) => {
        if (!nav) return;
        document.querySelector(`.nav-btn[data-nav="${nav}"]`)?.click();
    };

    // chapter footer prev/next re-use the same nav targets as the sidebar
    document.querySelectorAll(".btn-next").forEach((b) => {
        b.addEventListener("click", () => triggerNav(b.dataset.nextNav));
    });

    document.querySelectorAll(".btn-prev").forEach((b) => {
        b.addEventListener("click", () => triggerNav(b.dataset.prevNav));
    });

    // keep documentElement dataset in sync after scroll (coalesced to one rAF)
    let chRaf = null;
    function scheduleChapter() {
        if (chRaf != null) return;
        chRaf = requestAnimationFrame(() => {
            chRaf = null;
            syncChapterFromView();
        });
    }

    // after scroll: keep data-chapter “abstract” vs current essay section for styling/highlight
    function syncChapterFromView() {
        if (abstractEl && !abstractEl.hidden) setChapter("abstract");
        else if (chaptersEl && !chaptersEl.hidden) setChapter(visibleId);
    }

    // ——— reading progress (vertical bar desktop, horizontal bar mobile) ———
    function updateBar() {
        if (!progressFill || !scrollEl) return;
        const { full, abstract: absH, sectionHeights } = readMeasures();
        const root = scrollRoot();
        if (!root) return;

        let num = 0;
        if (abstractEl && !abstractEl.hidden) {
            num = root.scrollTop;
        } else if (chaptersEl && !chaptersEl.hidden && sectionHeights.length) {
            let acc = absH;
            const ix = SECTIONS.indexOf(visibleId);
            for (let i = 0; i < ix && i < sectionHeights.length; i++) acc += sectionHeights[i];
            if (mobile() && shell) {
                const top = scrollEl.offsetTop;
                num = acc + Math.max(0, shell.scrollTop - top) + scrollEl.scrollTop;
            } else {
                num = acc + scrollEl.scrollTop;
            }
        } else if (mobile() && shell) {
            const top = scrollEl.offsetTop;
            num = Math.max(0, shell.scrollTop - top) + scrollEl.scrollTop;
        } else {
            num = absH + root.scrollTop;
        }

        num = Math.min(Math.max(0, num), full);
        const clientH = root.clientHeight;
        const denom = full - clientH;
        let pct;
        if (denom <= 0) pct = full <= 0 ? 0 : Math.min(100, (num / full) * 100);
        else pct = Math.min(100, Math.max(0, (num / denom) * 100));

        if (mobile()) {
            progressFill.style.width = `${pct}%`;
            progressFill.style.height = "100%";
        } else {
            progressFill.style.height = `${pct}%`;
            progressFill.style.width = "100%";
        }
    }

    function onScroll() {
        updateBar(); // progress fill
        scheduleChapter(); // data-chapter + nav highlight
    }

    // attach scroll listener to whichever root is active (changes at breakpoint)
    function bindScroll() {
        shell?.removeEventListener("scroll", onScroll);
        scrollEl?.removeEventListener("scroll", onScroll);
        shell?.addEventListener("scroll", onScroll, { passive: true });
        scrollEl?.addEventListener("scroll", onScroll, { passive: true });
    }

    bindScroll();
    // mobile: outer column can scroll when sticky chrome is involved — still sync chapter
    window.addEventListener("scroll", scheduleChapter, { passive: true });
    window.addEventListener("resize", () => {
        invalidateMeasure();
        placeNotes();
        bindScroll();
        onScroll();
        if (!mobile()) schedulePick(); 
    });

    if (shell || scrollEl) onScroll();
    else scheduleChapter();

    // webfonts change line breaks → progress denominator needs a fresh measure
    document.fonts?.ready?.then(() => {
        invalidateMeasure();
        onScroll();
    });

    // initial layout: footnote positions, desktop IO, nav active state
    placeNotes();
    startNoteIo();
    syncNav();
});
