(function () {
  const DEBUG = true;

  // Centralized configuration for selectors and settings
  const CONFIG = {
    navbarSelector: '.navbar-new', // Selector for the navbar
    cmsListSelector: '[fs-cmsfilter-element="list"]', // Selector for CMS lists
    cmsItemSelector: '.w-dyn-item', // Selector for CMS items
    filterButtonSelector: '.fs-filter-button', // Selector for filter buttons
    filterCountSelector: '[data-filter-count]', // Selector for filter count elements
    filterMenuSelector: '.faqs_filter-menu', // Selector for the filter menu
    scrollTargetSelector: '.faq_sticky-container', // Selector for the scroll-to-top target
    fadeOutClass: 'fade-out', // Class to fade out elements
    hideClass: 'hide', // Class to hide elements
    firstItemClass: 'first-item', // Class for the first visible item
    lastItemClass: 'last-item', // Class for the last visible item
    timeoutDelay: 300, // Timeout delay for updates
    scrollDelay: 100, // Delay for scroll-to-top behavior
  };

  const originalFilterCounts = new WeakMap();

  // Utility: Log messages in debug mode
  const logDebug = (message, ...args) => {
    if (DEBUG) console.log(message, ...args);
  };

  // Utility: Add or remove classes
  const toggleClass = (element, className, condition) => {
    if (condition) {
      element.classList.add(className);
    } else {
      element.classList.remove(className);
    }
  };

  // ✅ Tag first/last visible items
  function updateCMSItemClasses() {
    const allLists = document.querySelectorAll(CONFIG.cmsListSelector);
    allLists.forEach((listContainer) => {
      if (listContainer.hasAttribute('data-skip-first-last')) return;
      const allItems = Array.from(listContainer.children).filter((child) =>
        child.classList.contains(CONFIG.cmsItemSelector.replace('.', ''))
      );
      const visibleItems = allItems.filter((item) => item.offsetParent !== null);
      if (!visibleItems.length) return;
      visibleItems.forEach((item) =>
        item.classList.remove(CONFIG.firstItemClass, CONFIG.lastItemClass)
      );
      visibleItems[0]?.classList.add(CONFIG.firstItemClass);
      visibleItems[visibleItems.length - 1]?.classList.add(CONFIG.lastItemClass);
    });
  }

  function observeListChanges() {
    const allLists = document.querySelectorAll(CONFIG.cmsListSelector);
    allLists.forEach((listContainer) => {
      if (listContainer.hasAttribute('data-skip-first-last')) return;
      const observer = new MutationObserver(() => {
        requestAnimationFrame(updateCMSItemClasses);
      });
      observer.observe(listContainer, { childList: true, subtree: true });
    });
  }

  // ✅ Hide empty filters + count logic
  function hideEmptyFilters(filterInstance) {
    const filterFields = filterInstance.filtersData;
    if (!filterFields?.length) return;
    DEBUG && console.groupCollapsed('🧠 Filter Visibility Check');

    filterFields.forEach((filterField) => {
      filterField.elements.forEach((element) => {
        const el = element.element;
        const wrapper = el.closest(CONFIG.cmsItemSelector);
        const currentCount = element.resultsCount;

        // Store initial full count
        if (!originalFilterCounts.has(el)) {
          originalFilterCounts.set(el, currentCount);
        }
        const fullCount = originalFilterCounts.get(el);

        // Update visible count UI
        const countEl = el
          .closest(CONFIG.filterButtonSelector)
          ?.querySelector(CONFIG.filterCountSelector);
        if (countEl) countEl.textContent = `(${fullCount})`;

        if (DEBUG) {
          const label = el.textContent.trim();
          console.log(
            `%c${label} → filtered: ${currentCount}, full: ${fullCount}`,
            fullCount === 0
              ? 'color: gray'
              : currentCount === 0
              ? 'color: orange'
              : 'color: green'
          );
        }

        if (wrapper) {
          wrapper.classList.remove(CONFIG.fadeOutClass);
          if (fullCount === 0) {
            wrapper.classList.add(CONFIG.fadeOutClass);
            setTimeout(() => (wrapper.style.display = 'none'), CONFIG.timeoutDelay);
          } else {
            wrapper.style.display = '';
          }
        }
      });
    });

    const menu = document.querySelector(CONFIG.filterMenuSelector);
    if (menu) {
      menu.classList.remove(CONFIG.hideClass);
      menu.style.display = 'block';
    }

    DEBUG && console.groupEnd();
  }

  // ✅ Scroll-to-top helper after pagination
  function scrollToTopAfterPagination() {
    const scrollTarget =
      document.querySelector(CONFIG.scrollTargetSelector) || document.body;
    setTimeout(() => {
      scrollTarget.scrollIntoView({ behavior: 'smooth' });
    }, CONFIG.scrollDelay);
  }

  // ✅ CMS Filter Init
  function initCMSFilterAfterLoadAll() {
    window.fsAttributes.push([
      'cmsfilter',
      ([filterInstance]) => {
        DEBUG && console.log('✅ CMS Filter initialized after loadAll');

        const updateAll = () => {
          hideEmptyFilters(filterInstance);
          updateCMSItemClasses();
        };

        setTimeout(updateAll, CONFIG.timeoutDelay);

        filterInstance.listInstance.on('renderitems', () => {
          setTimeout(updateAll, CONFIG.timeoutDelay);
        });

        document.addEventListener('fsPageUpdate', () => {
          setTimeout(() => {
            updateAll();
            scrollToTopAfterPagination();
          }, CONFIG.timeoutDelay);
        });
      },
    ]);
  }

  // ✅ Load All Items first
  window.fsAttributes = window.fsAttributes || [];
  window.fsAttributes.push([
    'cmsload',
    ([listInstance]) => {
      DEBUG && console.log('📦 CMS Load triggered');
      if (typeof listInstance?.loadAll === 'function') {
        listInstance.loadAll().then(() => {
          DEBUG && console.log('✅ All CMS items loaded via loadAll');
          initCMSFilterAfterLoadAll();
        });
      } else {
        DEBUG && console.warn('⚠️ loadAll not available. Proceeding without it.');
        initCMSFilterAfterLoadAll();
      }
    },
  ]);

  // ✅ Init first/last on load
  document.addEventListener('DOMContentLoaded', () => {
    updateCMSItemClasses();
    observeListChanges();
  });

  document.addEventListener('cmsload', () => {
    setTimeout(updateCMSItemClasses, CONFIG.timeoutDelay);
  });

  document.addEventListener('fsPageUpdate', () => {
    setTimeout(updateCMSItemClasses, CONFIG.timeoutDelay);
  });
})();
