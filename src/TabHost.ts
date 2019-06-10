import { TabPage } from "./TabPage.js";
import { Utils } from "./Utils.js";
import { TabHostDirection } from "./enums/TabHostDirection.js";
import { TabHandle } from "./TabHandle.js";
import { IDockContainer } from "./interfaces/IDockContainer.js";
import { DockManager } from "./DockManager.js";
import { PanelContainer } from "./PanelContainer.js";

/**
 * Tab Host control contains tabs known as TabPages.
 * The tab strip can be aligned in different orientations
 */
export class TabHost {
    displayCloseButton: boolean;
    dockManager: DockManager;
    tabStripDirection: TabHostDirection;
    hostElement: HTMLDivElement;
    tabListElement: HTMLDivElement;
    separatorElement: HTMLDivElement;
    contentElement: HTMLDivElement;
    createTabPage: (tabHost: any, container: any) => any;
    tabHandleListener: { onMoveTab: (e: any) => void; };
    eventListeners: any[];
    pages: TabPage[];
    activeTab: TabPage;
    _resizeRequested : boolean;

    constructor(dockManager: DockManager, tabStripDirection: TabHostDirection, displayCloseButton?: boolean) {
        /**
         * Create a tab host with the tab strip aligned in the [tabStripDirection] direciton
         * Only TabHost.DIRECTION_BOTTOM and TabHost.DIRECTION_TOP are supported
         */
        if (tabStripDirection === undefined) {
            tabStripDirection = TabHostDirection.BOTTOM;
        }

        if (displayCloseButton === undefined) {
            displayCloseButton = false;
        }

        this.dockManager = dockManager;
        this.tabStripDirection = tabStripDirection;
        this.displayCloseButton = displayCloseButton; // Indicates if the close button next to the tab handle should be displayed
        this.pages = [];
        this.eventListeners = [];
        this.tabHandleListener = {
            onMoveTab: (e) => { this.onMoveTab(e); }
        };
        this.hostElement = document.createElement('div');       // The main tab host DOM element
        this.tabListElement = document.createElement('div');    // Hosts the tab handles
        this.separatorElement = document.createElement('div');  // A seperator line between the tabs and content
        this.contentElement = document.createElement('div');    // Hosts the active tab content
        this.contentElement.tabIndex = 0;
        this.createTabPage = this._createDefaultTabPage;        // Factory for creating tab pages

        if (this.tabStripDirection === TabHostDirection.BOTTOM) {
            this.hostElement.appendChild(this.contentElement);
            this.hostElement.appendChild(this.separatorElement);
            this.hostElement.appendChild(this.tabListElement);
        }
        else if (this.tabStripDirection === TabHostDirection.TOP) {
            this.hostElement.appendChild(this.tabListElement);
            this.hostElement.appendChild(this.separatorElement);
            this.hostElement.appendChild(this.contentElement);
        }
        else {
            throw new Error('Only top and bottom tab strip orientations are supported');
        }

        this.hostElement.classList.add('dockspan-tab-host');
        this.tabListElement.classList.add('dockspan-tab-handle-list-container');
        this.separatorElement.classList.add('dockspan-tab-handle-content-seperator');
        this.contentElement.classList.add('dockspan-tab-content');
    }

    onMoveTab(e) {
        // this.tabListElement;
        let index = Array.prototype.slice.call(this.tabListElement.childNodes).indexOf(e.self.elementBase);
        this.change(this, /*handle*/e.self, e.state, index);
    }

    performTabsLayout(indexes: number[]) {
        this.pages = Utils.orderByIndexes(this.pages, indexes);

        let items = this.tabListElement.childNodes;
        let itemsArr = [];
        for (let i in items) {
            if (items[i].nodeType === 1) { // get rid of the whitespace text nodes
                itemsArr.push(items[i]);
            }
        }
        itemsArr = Utils.orderByIndexes(itemsArr, indexes);
        for (let i = 0; i < itemsArr.length; ++i) {
            this.tabListElement.appendChild(itemsArr[i]);
        }

        if (this.activeTab)
            this.onTabPageSelected(this.activeTab);
    }

    getActiveTab() {
        return this.activeTab;
    }

    addListener(listener) {
        this.eventListeners.push(listener);
    }

    removeListener(listener) {
        this.eventListeners.splice(this.eventListeners.indexOf(listener), 1);
    }

    change(host: TabHost, handle: TabHandle, state, index) {
        this.eventListeners.forEach((listener) => {
            if (listener.onChange) {
                listener.onChange({ host: host, handle: handle, state: state, index: index });
            }
        });
    }

    _createDefaultTabPage(tabHost: TabHost, container: IDockContainer) {
        return new TabPage(tabHost, container);
    }

    setActiveTab(container: IDockContainer) {
        let currentPage;
        this.pages.forEach((itm) => {
            if (itm.container === container) {
                currentPage = itm;
            }
        });
        if (this.pages.length > 0 && currentPage) {
            this.onTabPageSelected(currentPage);
            this.dockManager.activePanel = container as PanelContainer;
        }
    }

    resize(width: number, height: number) {
        this.hostElement.style.width = width + 'px';
        this.hostElement.style.height = height + 'px';

        let tabHeight = this.tabListElement.clientHeight;
        if (!this._resizeRequested)
            requestAnimationFrame(() => this.resizeTabListElement(width, height));
        this._resizeRequested = true;
        let separatorHeight = this.separatorElement.clientHeight;
        let contentHeight = height - tabHeight - separatorHeight;
        this.contentElement.style.height = contentHeight + 'px';

        if (this.activeTab)
            this.activeTab.resize(width, contentHeight);
    }

    resizeTabListElement(width: number, height?: number) {
        this._resizeRequested = false;
        if (this.pages.length === 0) return;
        let tabListWidth = 0;
        this.pages.forEach((page) => {
            let handle = page.handle;
            handle.elementBase.style.width = ''; //clear
            tabListWidth += handle.elementBase.clientWidth;
        });
        let scaleMultiplier = width / tabListWidth;
        if (scaleMultiplier > 1.2) return; //with a reserve
        this.pages.forEach((page, index) => {
            let handle = page.handle;
            let newSize = scaleMultiplier * handle.elementBase.clientWidth;
            if (index === this.pages.length - 1)
                newSize = newSize - 5;
            handle.elementBase.style.width = newSize + 'px';
        });
    }

    performLayout(children: IDockContainer[]) {
        // Destroy all existing tab pages not in children
        this.pages.forEach((tab) => {
            if (!children.some((x) => x == tab.container)) {
                tab.handle.removeListener(this.tabHandleListener);
                tab.destroy();
                let index = this.pages.indexOf(tab);
                if (index > -1) {
                    this.pages.splice(index, 1);
                }
            }
        });

        let oldActiveTab = this.activeTab;
        delete this.activeTab;

        let childPanels = children.filter((child) => {
            return child.containerType === 'panel';
        });

        if (childPanels.length > 0) {
            // Rebuild new tab pages
            childPanels.forEach((child) => {
                let page = null;
                if (!this.pages.some((x) => {
                    if (x.container == child) {
                        page = x;
                        return true;
                    }
                    return false;
                })) {
                    page = this.createTabPage(this, child);
                    page.handle.addListener(this.tabHandleListener);
                    this.pages.push(page);
                }

                // Restore the active selected tab
                if (oldActiveTab && page.container === oldActiveTab.container)
                    this.activeTab = page;
            });
            this._setTabHandlesVisible(true);
        }
        else
            // Do not show an empty tab handle host with zero tabs
            this._setTabHandlesVisible(false);

        if (this.activeTab)
            this.onTabPageSelected(this.activeTab);
    }

    _setTabHandlesVisible(visible: boolean) {
        this.tabListElement.style.display = visible ? 'flex' : 'none';
        this.separatorElement.style.display = visible ? 'block' : 'none';
    }

    onTabPageSelected(page: TabPage) {
        this.activeTab = page;
        this.pages.forEach((tabPage) => {
            let selected = (tabPage === page);
            tabPage.setSelected(selected);
        });

        // adjust the zIndex of the tabs to have proper shadow/depth effect
        let zIndexDelta = 1;
        let zIndex = 1000;
        this.pages.forEach((tabPage) => {
            tabPage.handle.setZIndex(zIndex);
            let selected = (tabPage === page);
            if (selected)
                zIndexDelta = -1;
            zIndex += zIndexDelta;
        });
    }
}