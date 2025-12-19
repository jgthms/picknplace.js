export function createPickPlace(options = {}) {
  const root = options.root || document;
  const listSelector = options.listSelector || ".pnp-list";
  const itemSelector = options.itemSelector || ".pnp-item";
  const controlsSelector = options.controlsSelector || ".pnp-controls";
  const buttonsSelector = options.buttonsSelector || ".pnp-buttons";
  const pickSelector = options.pickSelector || ".pnp-pick";
  const placeSelector = options.placeSelector || ".pnp-place";
  const cancelSelector = options.cancelSelector || ".pnp-cancel";
  const pickedClass = options.pickedClass || "pnp-picked";
  const realClass = options.realClass || "pnp-real";
  const ghostClass = options.ghostClass || "pnp-ghost";
  const cloneClass = options.cloneClass || "pnp-clone";

  let initialized = false;
  let $ghost = null;
  let scrollDirY = 0;
  let lastScrollY = window.scrollY;
  let targetIndex = null;
  let $controls = null;
  let ghostTop = 0;
  let ghostOffset = 0;

  // State
  let state = {
    mode: "idle",
    $list: null,
    $item: null,
    originalTop: 0,
    positions: [],
    currentIndex: null,
  };

  const reduce = (state, event) => {
    switch (event.type) {
      case "pick":
        return {
          mode: "picking",
          $item: event.$item,
          $list: event.$list,
          originalTop: event.originalTop,
          positions: event.positions,
          currentIndex: event.currentIndex,
        };

      case "place":
        return {
          mode: "idle",
          $list: null,
          $item: null,
          originalTop: 0,
          positions: [],
          currentIndex: null,
        };

      case "cancel":
        return {
          mode: "idle",
          $list: null,
          $item: null,
          originalTop: 0,
          positions: [],
          currentIndex: null,
        };

      default:
        return state;
    }
  };

  const dispatch = (event) => {
    const prev = state;
    const next = reduce(state, event);

    if (next === prev) {
      return;
    }

    // Store and reset
    state = next;
    targetIndex = null;

    // Update the DOM
    const $list = prev.$list || next.$list;

    if ($list) {
      $list.dataset.mode = next.mode;
    }

    if (next.mode === "picking") {
      next.$item?.classList.add(pickedClass);
      setPickingMode();
      next.$list?.classList.add("is-ready");
      createGhost(next.$item);

      if ($controls) {
        $controls.classList.add("is-active");
      }
    }

    if (next.mode === "idle") {
      prev.$item?.classList.remove(pickedClass);

      if (prev.$list) {
        prev.$list.classList.remove("is-ready");
        setIdleMode(prev.$list);
      }

      if ($controls) {
        $controls.classList.remove("is-active");
      }

      destroyGhost();
    }

    if (event.type === "place") {
      sortDomByNewIndices(prev.$list, prev.positions);
    }
  };

  // DOM
  const sortDomByNewIndices = ($list, positions) => {
    const ordered = positions
      .slice()
      .sort((a, b) => a.currentIndex - b.currentIndex);

    const frag = document.createDocumentFragment();
    for (const p of ordered) frag.appendChild(p.el);

    $list.appendChild(frag);
  };

  // Ghost
  const createGhost = (item) => {
    destroyGhost();

    const clone = item.cloneNode(true);
    clone.classList.add(ghostClass);

    const rect = item.getBoundingClientRect();

    Object.assign(clone.style, {
      position: "fixed",
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transform: `translate(${rect.left}px, calc(${rect.top}px + var(--offset)))`,
    });
    ghostTop = rect.top;

    const buttons = clone.querySelector(buttonsSelector);

    if (buttons) {
      buttons.innerHTML = `
        <button class="pnp-cancel" type="button">Cancel</button>
        <button class="pnp-place" type="button">Place</button>
      `;
    }

    document.body.appendChild(clone);
    $ghost = clone;
  };

  const destroyGhost = () => {
    if ($ghost) {
      $ghost.remove();
    }

    $ghost = null;
  };

  // Events
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      return dispatch({
        type: "cancel",
      });
    }

    if (event.key === "Enter") {
      return dispatch({
        type: "place",
      });
    }
  };

  const onClick = (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const cancelBtn = target.closest(cancelSelector);

    if (cancelBtn) {
      return dispatch({
        type: "cancel",
      });
    }

    const placeBtn = target.closest(placeSelector);

    if (placeBtn) {
      return dispatch({
        type: "place",
      });
    }

    const pickBtn = target.closest(pickSelector);

    if (pickBtn) {
      event.preventDefault();
      event.stopPropagation();

      if (state.mode === "picking") {
        return dispatch({
          type: "cancel",
        });
      }

      const $item = pickBtn.closest(itemSelector);
      const $list = $item?.closest(listSelector);

      if (!$item || !$list) {
        return;
      }

      const listRect = $list.getBoundingClientRect();

      const $items = Array.from($list.children);
      const currentIndex = $items.indexOf($item);

      const positions = $items.map((el, index) => {
        const rect = el.getBoundingClientRect();

        return {
          el,
          clone: null,
          originalIndex: index,
          currentIndex: index,
          originalTop: rect.top,
          rect,
        };
      });

      return dispatch({
        type: "pick",
        $list,
        $item,
        originalTop: listRect.top,
        positions,
        currentIndex,
      });
    }
  };

  const swapByIndex = (positions, indexA, indexB) => {
    if (indexA === indexB) return;

    const a = positions.find((p) => p.currentIndex === indexA);
    const b = positions.find((p) => p.currentIndex === indexB);

    if (!a || !b) return;

    a.currentIndex = indexB;
    b.currentIndex = indexA;
  };

  let scrollRaf = null;

  const onScroll = (event) => {
    if (state.mode !== "picking" || !$ghost || scrollRaf) {
      return;
    }

    const y = window.scrollY;
    scrollDirY = y - lastScrollY;
    lastScrollY = y;

    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;

      const ghostRect = $ghost.getBoundingClientRect();
      const ghostCenter = {
        x: ghostRect.left + ghostRect.width / 2,
        y: ghostRect.top + ghostRect.height / 2,
      };

      const $items = Array.from(state.$list.children).filter(
        (x) => !x.classList.contains(cloneClass)
      );

      let newTargetIndex;

      const listRect = state.$list.getBoundingClientRect();
      const listSpacing = parseFloat(getComputedStyle(state.$list).paddingTop);

      // If the ghost goes above the list
      if (listRect.top + listSpacing > ghostTop) {
        ghostOffset = listRect.top - ghostTop + listSpacing;
      } else if (
        ghostTop >
        listRect.top + listRect.height - ghostRect.height - listSpacing
      ) {
        const diff =
          listRect.top + listRect.height - ghostRect.height - listSpacing;
        ghostOffset = -1 * ghostTop + diff;
      } else {
        ghostOffset = 0;
      }

      $ghost.style.setProperty("--offset", `${ghostOffset}px`);

      if (ghostCenter.y > listRect.top + listRect.height) {
        newTargetIndex = $items.length - 1;
      } else if (scrollDirY >= 0) {
        // Going down: swap when center crosses the top edge
        for (const [index, $item] of $items.entries()) {
          const rect = $item.getBoundingClientRect();

          if (ghostCenter.y < rect.top) {
            newTargetIndex = index - 1;
            break;
          }

          newTargetIndex = $items.length - 1;
        }
      } else {
        // Going up: swap when center crosses the bottom edge
        for (const [index, $item] of $items.entries()) {
          const rect = $item.getBoundingClientRect();

          if (ghostCenter.y < rect.bottom) {
            newTargetIndex = index;
            break;
          }

          newTargetIndex = 0;
        }
      }

      if (newTargetIndex !== targetIndex) {
        swapByIndex(state.positions, targetIndex, newTargetIndex);
        transformItems();
        targetIndex = newTargetIndex;
      }
    });
  };

  // Modes
  const setPickingMode = () => {
    const listRect = state.$list.getBoundingClientRect();

    for (const position of state.positions) {
      const { el, rect } = position;
      const clone = el.cloneNode(true);
      clone.classList.remove(realClass);
      clone.classList.add(cloneClass);
      position.clone = clone;

      Object.assign(clone.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        width: `${rect.width}px`,
        transform: `translate(
          ${rect.left - listRect.left}px,
          ${rect.top - listRect.top}px
        )`,
      });

      state.$list.appendChild(clone);
    }
  };

  const transformItems = () => {
    const listRect = state.$list.getBoundingClientRect();

    for (const position of state.positions) {
      const { clone, currentIndex, rect } = position;

      let top = rect.top;

      const found = state.positions.find(
        (pos) => currentIndex === pos.originalIndex
      );

      if (found && found.originalTop) {
        top = found.originalTop;
      }

      Object.assign(clone.style, {
        transform: `translate(
          ${rect.left - listRect.left}px,
          ${top - state.originalTop}px
        )`,
      });
    }
  };

  const setIdleMode = ($list) => {
    const clones = $list.querySelectorAll(`.${cloneClass}`);

    for (const clone of clones) {
      clone.remove();
    }
  };

  // Lifecyle
  const init = () => {
    if (initialized) {
      return;
    }

    $controls = root.querySelector(controlsSelector);
    root.addEventListener("click", onClick, true);
    root.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, { passive: true });

    initialized = true;
  };

  return {
    init,
  };
}
