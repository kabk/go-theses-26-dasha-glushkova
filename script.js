// script.js
document.addEventListener("DOMContentLoaded", () => {
    const sideMenu = document.getElementById("side-menu");
    const menuBar = document.querySelector(".side-menu-bar");
    const closeBtn = document.querySelector(".side-menu-close");
    const menuItems = document.querySelectorAll(".menu-item");

    if (!sideMenu || !menuBar) return;

    function closeMenu() {
        sideMenu.classList.remove("open");
    }

    function toggleMenu() {
        sideMenu.classList.toggle("open");
    }

    // Menu toggle
    menuBar.addEventListener("click", (e) => {
        if (e.target.closest(".side-menu-close") || e.target.closest(".menu-item")) return;
        toggleMenu();
    });

    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeMenu();
        });
    }

    menuBar.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleMenu();
        }
    });

    menuItems.forEach((item) => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            const target = document.getElementById(item.dataset.target);
            if (target) {
                target.scrollIntoView({ behavior: "smooth" });
                closeMenu();
            }
        });
    });

    // ----------------------------
    // References (.ref) handling
    // ----------------------------
    const refs = document.querySelectorAll(".ref");
    const rightContainer = document.querySelector(".column-right .text-container");
    const scrollContainer = document.querySelector(".column-left .text-container");
    let pinnedRef = null;

    // Map references: text or images (key = data-ref value)
    const references = {
        text1: "<p class='active-ref'>This is some detailed text about the first reference. Bigger font and top padding.</p>",
        text2: "<p class='active-ref'>Another text reference with larger font and spacing at the top.</p>",
        image1: "<img class='active-ref' src='images/tree.png' alt='Tree Image'>"
    };

    function showRef(ref) {
        if (!rightContainer) return;
        const key = ref?.dataset?.ref;
        if (!key) return;
        if (references[key]) {
            rightContainer.innerHTML = references[key];
            rightContainer.scrollTop = 0;
        } else {
            rightContainer.textContent = key;
        }
        rightContainer.classList.add("ref-visible");
    }

    function clearRightPanel() {
        if (!rightContainer) return;
        rightContainer.innerHTML = "";
        rightContainer.classList.remove("ref-visible");
    }

    // Scroll-based: show ref on right when it scrolls into view
    if (scrollContainer && rightContainer && refs.length > 0) {
        let currentDisplayedRef = null;

        function refIsInView(ref, containerTop, containerBottom) {
            const refRect = ref.getBoundingClientRect();
            return refRect.bottom >= containerTop && refRect.top <= containerBottom;
        }

        function getVisibleRef() {
            const containerRect = scrollContainer.getBoundingClientRect();
            const containerTop = containerRect.top;
            const containerBottom = containerRect.bottom;
            const containerCenter = (containerTop + containerBottom) / 2;

            // Stability: keep current ref if it's still in view (prevents blinking)
            if (currentDisplayedRef && refIsInView(currentDisplayedRef, containerTop, containerBottom)) {
                return currentDisplayedRef;
            }

            let best = null;
            let bestScore = -Infinity;

            refs.forEach((ref) => {
                const refRect = ref.getBoundingClientRect();
                const refCenter = (refRect.top + refRect.bottom) / 2;
                const overlaps = refRect.bottom >= containerTop && refRect.top <= containerBottom;

                if (overlaps) {
                    const distanceFromCenter = Math.abs(refCenter - containerCenter);
                    const score = 1 / (1 + distanceFromCenter);
                    if (score > bestScore) {
                        bestScore = score;
                        best = ref;
                    }
                }
            });
            return best;
        }

        function updateRefDisplay() {
            if (pinnedRef) return;
            const best = getVisibleRef();
            currentDisplayedRef = best;
            refs.forEach((ref) => ref.classList.toggle("ref-in-view", ref === best));
            if (best) {
                showRef(best);
            } else {
                clearRightPanel();
            }
        }

        // Run on load (refs may already be in view)
        updateRefDisplay();

        // Run on scroll
        scrollContainer.addEventListener("scroll", updateRefDisplay, { passive: true });
        window.addEventListener("resize", updateRefDisplay);
    }

    refs.forEach((ref) => {
        ref.addEventListener("mouseenter", () => {
            if (!pinnedRef) showRef(ref);
        });
        ref.addEventListener("mouseleave", () => {
            if (!pinnedRef && rightContainer) {
                // Restore scroll-based display or keep current
                const best = document.querySelector(".ref-in-view");
                if (best) showRef(best);
                else rightContainer.classList.remove("ref-visible");
            }
        });

        ref.addEventListener("click", (e) => {
            e.preventDefault();
            if (pinnedRef === ref) {
                pinnedRef = null;
                clearRightPanel();
                const best = document.querySelector(".ref-in-view");
                if (best) showRef(best);
            } else {
                pinnedRef = ref;
                showRef(ref);
            }
        });
    });

    // ----------------------------
    // Reading progress bar
    // ----------------------------
    const container = document.querySelector(".column-left .text-container");
    const progressBar = document.querySelector(".reading-progress");
    const progressFill = document.querySelector(".reading-progress-fill");

    if (container && progressBar && progressFill) {
        function updateProgress() {
            const scrollTop = container.scrollTop;
            const scrollHeight = container.scrollHeight - container.clientHeight;
            const percent = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
            progressBar.style.setProperty("--progress", percent + "%");
        }
        updateProgress();
        container.addEventListener("scroll", updateProgress);
        window.addEventListener("resize", updateProgress);
    }
});