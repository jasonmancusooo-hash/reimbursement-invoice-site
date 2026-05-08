const APP_VERSION = "1.2.1";

let restaurants = {};

const categoryLabels = {
  dishes: "菜品",
  staple: "主食",
  drinks: "饮品",
  soup: "汤品"
};

const restaurantOrder = ["sichuan", "hotpot", "arabic"];

const state = {
  currentRestaurant: "sichuan",
  currentCategory: "dishes",
  cart: [],
  template: "classic",
  savedInvoices: [],
  storageMode: "api",
  selectedSavedIds: new Set()
};

const isVercelHost = window.location.hostname.endsWith("vercel.app");

const landingPage = document.getElementById("landingPage");
const appRoot = document.getElementById("appRoot");
const enterSystemBtn = document.getElementById("enterSystemBtn");
const exitBtn = document.getElementById("exitBtn");
const versionInfo = document.getElementById("versionInfo");
const versionInfoLanding = document.getElementById("versionInfoLanding");
const openChangelogBtn = document.getElementById("openChangelogBtn");
const changelogModal = document.getElementById("changelogModal");
const closeChangelogBtn = document.getElementById("closeChangelogBtn");

const confirmModal = document.getElementById("confirmModal");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");
const modalConfirm = document.getElementById("modalConfirm");
const modalCancel = document.getElementById("modalCancel");
const modalNeutral = document.getElementById("modalNeutral");

const tabWrap = document.getElementById("restaurantTabs");
const categoryTabs = document.getElementById("categoryTabs");
const menuGrid = document.getElementById("menuGrid");
const cartList = document.getElementById("cartList");
const clearCartBtn = document.getElementById("clearCartBtn");
const subtotalEl = document.getElementById("subtotal");
const grandTotalEl = document.getElementById("grandTotal");
const taxRateEl = document.getElementById("taxRate");
const searchInput = document.getElementById("searchInput");
const invoiceForm = document.getElementById("invoiceForm");
const templatePicker = document.getElementById("templatePicker");
const invoicePreview = document.getElementById("invoicePreview");
const exportBtn = document.getElementById("exportBtn");
const saveBtn = document.getElementById("saveBtn");
const savedInvoicesEl = document.getElementById("savedInvoices");
const batchDeleteBtn = document.getElementById("batchDeleteBtn");
const panels = [...document.querySelectorAll(".panel")];
const pixelFlowBg = document.getElementById("pixelFlowBg");

if (!invoiceForm.elements.invoiceDate.value) {
  invoiceForm.elements.invoiceDate.valueAsDate = new Date();
}

function formatVersionStamp() {
  const now = new Date();
  const formatted = now.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  return `v${APP_VERSION} | 更新于 ${formatted}`;
}

function setVersionText() {
  const text = formatVersionStamp();
  versionInfo.textContent = text;
  versionInfoLanding.textContent = text;
}

function showModal({ title, message, confirmText = "是", cancelText = "否", neutralText = "" }) {
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalConfirm.textContent = confirmText;
  modalCancel.textContent = cancelText;
  if (neutralText) {
    modalNeutral.textContent = neutralText;
    modalNeutral.classList.remove("hidden");
  } else {
    modalNeutral.classList.add("hidden");
  }
  confirmModal.classList.remove("hidden");

  return new Promise((resolve) => {
    const cleanup = () => {
      confirmModal.classList.add("hidden");
      modalConfirm.removeEventListener("click", onConfirm);
      modalCancel.removeEventListener("click", onCancel);
      modalNeutral.removeEventListener("click", onNeutral);
    };

    const onConfirm = () => {
      cleanup();
      resolve(neutralText ? "confirm" : true);
    };

    const onCancel = () => {
      cleanup();
      resolve(neutralText ? "cancel" : false);
    };

    const onNeutral = () => {
      cleanup();
      resolve("neutral");
    };

    modalConfirm.addEventListener("click", onConfirm);
    modalCancel.addEventListener("click", onCancel);
    modalNeutral.addEventListener("click", onNeutral);
  });
}

function getOrderedRestaurantEntries() {
  const entries = Object.entries(restaurants);
  return entries.sort((a, b) => restaurantOrder.indexOf(a[0]) - restaurantOrder.indexOf(b[0]));
}

function getDisplayName(item, restaurantKey) {
  if (restaurantKey === "arabic") {
    return `${item.cn} / ${item.ar}`;
  }
  return `${item.cn} / ${item.en}`;
}

function getExportName(item, restaurantKey) {
  return restaurantKey === "arabic" ? item.ar : item.en;
}

function setDefaultRestaurantNameByRestaurantKey(restaurantKey) {
  const current = (invoiceForm.elements.restaurantName.value || "").trim();
  if (restaurantKey === "sichuan" && current === "") {
    invoiceForm.elements.restaurantName.value = "Al Noor Hosting Company";
  }
}

function getLocalInvoices() {
  try {
    const raw = sessionStorage.getItem("saved_invoices_v121");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalInvoices(invoices) {
  sessionStorage.setItem("saved_invoices_v121", JSON.stringify(invoices));
}

function clearCurrentMenu() {
  state.cart = [];
  renderCart();
}

function calcTotals() {
  const subtotal = state.cart.reduce((sum, row) => sum + row.price * row.qty, 0);
  const taxRate = Number(taxRateEl.value || 0);
  const taxAmount = subtotal * (taxRate / 100);
  return {
    subtotal,
    taxRate,
    taxAmount,
    total: subtotal + taxAmount
  };
}

function setPanelFocus(panel) {
  appRoot.classList.add("has-focus");
  panels.forEach((item) => item.classList.remove("focus"));
  panel.classList.add("focus");
}

function clearPanelFocus() {
  appRoot.classList.remove("has-focus");
  panels.forEach((item) => item.classList.remove("focus"));
}

function findCartItemById(id) {
  return state.cart.find((row) => row.id === id);
}

function setCartQtyById(id, qty) {
  const item = findCartItemById(id);
  if (!item) return;
  if (qty <= 0) {
    state.cart = state.cart.filter((row) => row.id !== id);
  } else {
    item.qty = qty;
  }
  renderCart();
}

function adjustCartQty(id, delta) {
  const item = findCartItemById(id);
  if (!item) return;
  const nextQty = item.qty + delta;
  if (nextQty <= 0) {
    showModal({
      title: "删除菜品",
      message: "是否删除菜品"
    }).then((confirmed) => {
      if (!confirmed) return;
      state.cart = state.cart.filter((row) => row.id !== id);
      renderCart();
    });
    return;
  }
  item.qty = nextQty;
  renderCart();
}

function applyInvoiceToCurrentView(invoice) {
  state.currentRestaurant = invoice.restaurantKey || state.currentRestaurant;
  if (!restaurants[state.currentRestaurant]) {
    state.currentRestaurant = restaurantOrder[0];
  }

  state.currentCategory = restaurants[state.currentRestaurant]?.categories?.[0] || "dishes";
  state.cart = invoice.items || [];

  invoiceForm.elements.invoiceNo.value = invoice.invoiceNo || "";
  invoiceForm.elements.invoiceDate.value = invoice.invoiceDate || "";
  invoiceForm.elements.payer.value = invoice.payer || "";
  invoiceForm.elements.taxNo.value = invoice.taxNo || "";
  invoiceForm.elements.project.value = invoice.project || "";
  invoiceForm.elements.handler.value = invoice.handler || "";
  invoiceForm.elements.note.value = invoice.note || "";
  invoiceForm.elements.restaurantName.value = invoice.restaurantName || "";
  if (!invoice.restaurantName) setDefaultRestaurantNameByRestaurantKey(state.currentRestaurant);
  if (typeof invoice.taxRate === "number") taxRateEl.value = invoice.taxRate;

  state.template = invoice.template || "classic";
  [...templatePicker.querySelectorAll("button")].forEach((button) => {
    button.classList.toggle("active", button.dataset.template === state.template);
  });

  renderTabs();
  renderCategoryTabs();
  renderMenu();
  renderCart();
  renderPreview();
}

async function loadRestaurants() {
  const res = await fetch("/api/restaurants");
  restaurants = await res.json();

  if (!restaurants[state.currentRestaurant]) {
    state.currentRestaurant = restaurantOrder.find((key) => restaurants[key]) || Object.keys(restaurants)[0];
  }
  state.currentCategory = restaurants[state.currentRestaurant]?.categories?.[0] || "dishes";
  setDefaultRestaurantNameByRestaurantKey(state.currentRestaurant);

  renderTabs();
  renderCategoryTabs();
  renderMenu();
  renderCart();
  renderPreview();
}

async function loadSavedInvoices() {
  if (isVercelHost) {
    state.storageMode = "local";
    state.savedInvoices = getLocalInvoices();
    renderSavedInvoices();
    return;
  }

  try {
    const res = await fetch("/api/invoices");
    if (!res.ok) throw new Error("api load failed");
    state.savedInvoices = await res.json();
    state.storageMode = "api";
  } catch {
    state.savedInvoices = getLocalInvoices();
    state.storageMode = "local";
  }
  renderSavedInvoices();
}

function renderTabs() {
  tabWrap.innerHTML = "";
  getOrderedRestaurantEntries().forEach(([key, restaurant]) => {
    const btn = document.createElement("button");
    btn.textContent = `${restaurant.label}（${restaurant.items.length} 类）`;
    btn.className = key === state.currentRestaurant ? "active" : "";
    btn.onclick = async () => {
      if (key === state.currentRestaurant) return;

      if (state.cart.length > 0) {
        const confirmed = await showModal({
          title: "切换餐厅",
          message: "如果切换餐厅将清空当前菜单，是否继续？"
        });
        if (!confirmed) return;
        clearCurrentMenu();
      }

      state.currentRestaurant = key;
      state.currentCategory = restaurants[state.currentRestaurant]?.categories?.[0] || "dishes";
      setDefaultRestaurantNameByRestaurantKey(state.currentRestaurant);
      renderTabs();
      renderCategoryTabs();
      renderMenu();
      renderPreview();
    };
    tabWrap.appendChild(btn);
  });
}

function renderCategoryTabs() {
  categoryTabs.innerHTML = "";
  const categories = restaurants[state.currentRestaurant]?.categories || ["dishes"];

  categories.forEach((category) => {
    const btn = document.createElement("button");
    btn.textContent = categoryLabels[category] || category;
    btn.className = category === state.currentCategory ? "active" : "";
    btn.onclick = () => {
      state.currentCategory = category;
      renderCategoryTabs();
      renderMenu();
    };
    categoryTabs.appendChild(btn);
  });
}

async function ensureRestaurantConsistency() {
  const hasCrossRestaurantItems = state.cart.some((row) => row.restaurant !== state.currentRestaurant);
  if (!hasCrossRestaurantItems) return true;

  const confirmed = await showModal({
    title: "切换餐厅",
    message: "如果切换餐厅将清空当前菜单，是否继续？"
  });
  if (!confirmed) return false;
  clearCurrentMenu();
  return true;
}

function getMenuItemQty(itemId) {
  return state.cart.find((row) => row.id === itemId)?.qty || 0;
}

function createQtyControl(itemId, qty, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "qty-control";

  const minusBtn = document.createElement("button");
  minusBtn.type = "button";
  minusBtn.textContent = "-";
  minusBtn.onclick = () => onChange(-1);

  const qtyInput = document.createElement("input");
  qtyInput.type = "text";
  qtyInput.value = String(qty);
  qtyInput.readOnly = true;
  qtyInput.ondblclick = () => {
    qtyInput.readOnly = false;
    qtyInput.focus();
    qtyInput.select();
  };
  qtyInput.onblur = () => {
    const parsed = Number(qtyInput.value);
    qtyInput.readOnly = true;
    if (!Number.isFinite(parsed) || parsed < 0) {
      qtyInput.value = String(qty);
      return;
    }
    onChange(parsed - qty);
  };
  qtyInput.onkeydown = (event) => {
    if (event.key === "Enter") qtyInput.blur();
  };

  const plusBtn = document.createElement("button");
  plusBtn.type = "button";
  plusBtn.textContent = "+";
  plusBtn.onclick = () => onChange(1);

  wrap.appendChild(minusBtn);
  wrap.appendChild(qtyInput);
  wrap.appendChild(plusBtn);
  return wrap;
}

function renderMenu(animate = true) {
  const query = searchInput.value.trim().toLowerCase();
  const items = restaurants[state.currentRestaurant]?.items || [];
  const list = items.filter((item) => {
    const displayName = getDisplayName(item, state.currentRestaurant).toLowerCase();
    return item.category === state.currentCategory && displayName.includes(query);
  });

  menuGrid.innerHTML = "";
  if (animate) {
    menuGrid.classList.remove("menu-animate");
    requestAnimationFrame(() => menuGrid.classList.add("menu-animate"));
  } else {
    menuGrid.classList.remove("menu-animate");
  }

  list.forEach((item) => {
    const card = document.createElement("div");
    card.className = "menu-item";

    const info = document.createElement("div");
    info.innerHTML = `<div><strong>${getDisplayName(item, state.currentRestaurant)}</strong></div><div>¥ ${item.price.toFixed(2)}</div>`;

    const qty = getMenuItemQty(item.id);
    if (qty === 0) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "plus-btn";
      addBtn.textContent = "+";
      addBtn.onclick = async () => {
        const pass = await ensureRestaurantConsistency();
        if (!pass) return;
        state.cart.push({
          id: item.id,
          category: item.category,
          restaurant: state.currentRestaurant,
          displayName: getDisplayName(item, state.currentRestaurant),
          exportName: getExportName(item, state.currentRestaurant),
          price: item.price,
          qty: 1
        });
        renderMenu(false);
        renderCart();
      };
      card.appendChild(info);
      card.appendChild(addBtn);
    } else {
      const control = createQtyControl(item.id, qty, async (delta) => {
        const pass = await ensureRestaurantConsistency();
        if (!pass) return;
        const row = findCartItemById(item.id);
        if (!row) return;
        const next = row.qty + delta;
        if (next <= 0) {
          const ok = await showModal({ title: "删除菜品", message: "是否删除菜品" });
          if (!ok) return;
          state.cart = state.cart.filter((entry) => entry.id !== item.id);
        } else {
          row.qty = next;
        }
        renderMenu(false);
        renderCart();
      });
      card.appendChild(info);
      card.appendChild(control);
    }

    menuGrid.appendChild(card);
  });
}

function renderCart() {
  cartList.innerHTML = "";
  if (!state.cart.length) {
    cartList.innerHTML = "<p>暂无已选菜品。</p>";
  }

  state.cart.forEach((row, index) => {
    const line = document.createElement("div");
    line.className = "cart-row";

    const left = document.createElement("span");
    left.textContent = `${index + 1}. ${row.displayName}`;

    const price = document.createElement("strong");
    price.textContent = `¥ ${(row.price * row.qty).toFixed(2)}`;

    const control = createQtyControl(row.id, row.qty, async (delta) => {
      const item = findCartItemById(row.id);
      if (!item) return;
      const next = item.qty + delta;
      if (next <= 0) {
        const ok = await showModal({ title: "删除菜品", message: "是否删除菜品" });
        if (!ok) return;
        state.cart = state.cart.filter((entry) => entry.id !== row.id);
      } else {
        item.qty = next;
      }
      renderMenu(false);
      renderCart();
    });

    line.appendChild(left);
    line.appendChild(price);
    line.appendChild(control);
    cartList.appendChild(line);
  });

  const totals = calcTotals();
  subtotalEl.textContent = `¥ ${totals.subtotal.toFixed(2)}`;
  grandTotalEl.textContent = `¥ ${totals.total.toFixed(2)}`;
  renderPreview();
}

function getInvoiceData() {
  const totals = calcTotals();
  return {
    invoiceNo: invoiceForm.elements.invoiceNo.value,
    invoiceDate: invoiceForm.elements.invoiceDate.value,
    payer: invoiceForm.elements.payer.value,
    taxNo: invoiceForm.elements.taxNo.value,
    project: invoiceForm.elements.project.value,
    handler: invoiceForm.elements.handler.value,
    note: invoiceForm.elements.note.value,
    restaurantName: invoiceForm.elements.restaurantName.value,
    restaurant: restaurants[state.currentRestaurant]?.label || "",
    restaurantKey: state.currentRestaurant,
    items: state.cart,
    subtotal: totals.subtotal,
    taxRate: totals.taxRate,
    taxAmount: totals.taxAmount,
    total: totals.total,
    template: state.template
  };
}

function renderPreview() {
  const data = getInvoiceData();
  invoicePreview.className = `invoice-preview ${state.template}`;

  const itemsHtml = state.cart
    .map((row, index) => `<tr><td>${index + 1}</td><td>${row.displayName}</td><td>${row.qty}</td><td>¥ ${row.price.toFixed(2)}</td><td>¥ ${(row.price * row.qty).toFixed(2)}</td></tr>`)
    .join("");

  invoicePreview.innerHTML = `
    <h3>发票预览 - ${state.template}</h3>
    <p><strong>发票号：</strong>${data.invoiceNo || ""}</p>
    <p><strong>开票日期：</strong>${data.invoiceDate || ""}</p>
    <p><strong>付款方：</strong>${data.payer || ""}</p>
    <p><strong>税号：</strong>${data.taxNo || ""}</p>
    <p><strong>报销项目：</strong>${data.project || ""} | <strong>经办人：</strong>${data.handler || ""}</p>
    <p><strong>餐厅：</strong>${data.restaurant}</p>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr><th>No.</th><th align="left">品名</th><th>数量</th><th>单价</th><th>小计</th></tr>
      </thead>
      <tbody>${itemsHtml || "<tr><td colspan='5'>暂无项目</td></tr>"}</tbody>
    </table>
    <p><strong>未税金额：</strong>¥ ${data.subtotal.toFixed(2)}</p>
    <p><strong>税额(${data.taxRate}%):</strong>¥ ${data.taxAmount.toFixed(2)}</p>
    <p><strong>合计：</strong>¥ ${data.total.toFixed(2)}</p>
    <p><strong>备注：</strong>${data.note || ""}</p>
  `;
}

function renderSavedInvoices() {
  savedInvoicesEl.innerHTML = "";
  if (!state.savedInvoices.length) {
    savedInvoicesEl.innerHTML = "<p>暂无已保存发票。</p>";
    return;
  }

  state.savedInvoices.forEach((invoice) => {
    const wrap = document.createElement("div");
    wrap.className = "saved-item-wrap";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "saved-check";
    checkbox.checked = state.selectedSavedIds.has(invoice.id);
    checkbox.onchange = () => {
      if (checkbox.checked) state.selectedSavedIds.add(invoice.id);
      else state.selectedSavedIds.delete(invoice.id);
    };

    const itemBtn = document.createElement("button");
    itemBtn.className = "saved-item";
    itemBtn.textContent = `${invoice.invoiceNo || "未编号"} | ${invoice.restaurant} | ${invoice.invoiceDate || "无日期"}`;
    itemBtn.onclick = async () => {
      const confirmed = await showModal({
        title: "读取已保存发票",
        message: "是否显示所选菜单并清空当前菜单？"
      });
      if (!confirmed) return;
      clearCurrentMenu();
      applyInvoiceToCurrentView(invoice);
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "删除";
    deleteBtn.onclick = async () => {
      const confirmed = await showModal({ title: "删除确认", message: "是否删除这条已保存发票？" });
      if (!confirmed) return;
      await deleteInvoicesByIds([invoice.id]);
      await loadSavedInvoices();
    };

    wrap.appendChild(checkbox);
    wrap.appendChild(itemBtn);
    wrap.appendChild(deleteBtn);
    savedInvoicesEl.appendChild(wrap);
  });
}

async function deleteInvoicesByIds(ids) {
  if (!ids.length) return;
  if (state.storageMode === "api") {
    for (const id of ids) {
      try {
        const response = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("api delete failed");
      } catch {
        state.storageMode = "local";
        break;
      }
    }
  }

  if (state.storageMode === "local") {
    const next = getLocalInvoices().filter((row) => !ids.includes(row.id));
    setLocalInvoices(next);
  }

  ids.forEach((id) => state.selectedSavedIds.delete(id));
}

async function saveInvoiceToServer() {
  const data = getInvoiceData();
  if (!data.items.length) {
    await showModal({
      title: "当前为空",
      message: "当前为空，请添加菜品",
      confirmText: "确定",
      cancelText: "关闭"
    });
    return null;
  }

  if (state.storageMode === "api" && !isVercelHost) {
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error("api save failed");
      const saved = await response.json();
      await loadSavedInvoices();
      return saved;
    } catch {
      state.storageMode = "local";
    }
  }

  const localInvoices = getLocalInvoices();
  const saved = {
    id: `local_inv_${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...data
  };
  localInvoices.push(saved);
  setLocalInvoices(localInvoices);
  await loadSavedInvoices();
  return saved;
}

async function onSaveInvoiceClick() {
  const data = getInvoiceData();
  if (!data.items.length) {
    await showModal({ title: "当前为空", message: "当前为空，请添加菜品", confirmText: "确定", cancelText: "关闭" });
    return;
  }

  const confirmed = await showModal({
    title: "保存发票",
    message: "是否临时保存当前发票并清空选项？"
  });
  if (!confirmed) return;

  const saved = await saveInvoiceToServer();
  if (!saved) return;

  clearCurrentMenu();
  renderMenu(false);
  await showModal({ title: "保存成功", message: `发票已保存，记录ID: ${saved.id}`, confirmText: "好的", cancelText: "关闭" });
}

async function onExportClick() {
  const data = getInvoiceData();
  if (!data.items.length) {
    await showModal({ title: "当前为空", message: "当前为空，请添加菜品", confirmText: "确定", cancelText: "关闭" });
    return;
  }

  const exportChoice = await showModal({
    title: "导出发票",
    message: "即将导出发票excel，是否需要保存当前菜单？",
    confirmText: "保存",
    cancelText: "不保存",
    neutralText: "取消"
  });

  if (exportChoice === "neutral") {
    return;
  }

  if (exportChoice === "confirm") {
    const saved = await saveInvoiceToServer();
    if (!saved) return;
  } else {
    clearCurrentMenu();
    renderMenu(false);
  }

  const response = await fetch("/api/export-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    await showModal({ title: "导出失败", message: "模板导出失败，请稍后重试。", confirmText: "确定", cancelText: "关闭" });
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${data.invoiceNo || "invoice"}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  await showModal({
    title: "导出成功",
    message: "导出成功，请注意格式修改",
    confirmText: "确定",
    cancelText: "关闭"
  });
}

async function onExitSite() {
  const confirmed = await showModal({
    title: "退出确认",
    message: "每一次退出网站，当前已保存将清空，是否退出？"
  });
  if (!confirmed) return;

  state.savedInvoices = [];
  state.cart = [];
  state.selectedSavedIds.clear();
  sessionStorage.removeItem("saved_invoices_v121");
  renderSavedInvoices();
  renderCart();
  renderMenu();
  appRoot.classList.add("hidden");
  landingPage.classList.remove("hidden");
}

async function onBatchDelete() {
  if (!state.selectedSavedIds.size) {
    await showModal({ title: "提示", message: "请先勾选要删除的发票", confirmText: "确定", cancelText: "关闭" });
    return;
  }

  const ok = await showModal({ title: "批量删除", message: "是否删除已勾选发票？" });
  if (!ok) return;

  await deleteInvoicesByIds([...state.selectedSavedIds]);
  await loadSavedInvoices();
}

function bindFocusHandlers() {
  panels.forEach((panel) => {
    panel.addEventListener("mouseenter", () => setPanelFocus(panel));
    panel.addEventListener("mouseleave", clearPanelFocus);
    panel.addEventListener("focusin", () => setPanelFocus(panel));
    panel.addEventListener("focusout", () => {
      if (!panel.contains(document.activeElement)) clearPanelFocus();
    });
  });
}

function bindEvents() {
  enterSystemBtn.addEventListener("click", () => {
    landingPage.classList.add("hidden");
    appRoot.classList.remove("hidden");
  });

  openChangelogBtn.addEventListener("click", () => {
    changelogModal.classList.remove("hidden");
  });

  closeChangelogBtn.addEventListener("click", () => {
    changelogModal.classList.add("hidden");
  });

  exitBtn.addEventListener("click", onExitSite);
  clearCartBtn.addEventListener("click", async () => {
    if (!state.cart.length) return;
    const ok = await showModal({ title: "清空菜单", message: "是否一键清空当前已选清单？" });
    if (!ok) return;
    clearCurrentMenu();
    renderMenu();
  });

  window.addEventListener("beforeunload", () => {
    sessionStorage.removeItem("saved_invoices_v121");
  });

  searchInput.addEventListener("input", renderMenu);
  taxRateEl.addEventListener("input", renderCart);
  invoiceForm.addEventListener("input", renderPreview);
  templatePicker.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-template]");
    if (!button) return;
    state.template = button.dataset.template;
    [...templatePicker.querySelectorAll("button")].forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    renderPreview();
  });

  saveBtn.addEventListener("click", onSaveInvoiceClick);
  exportBtn.addEventListener("click", onExportClick);
  batchDeleteBtn.addEventListener("click", onBatchDelete);
  bindFocusHandlers();
}

function initPixelFlowBackground() {
  if (!pixelFlowBg) return;
  const ctx = pixelFlowBg.getContext("2d", { alpha: true });
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let animationId = 0;
  const step = 16;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    pixelFlowBg.width = Math.floor(width * ratio);
    pixelFlowBg.height = Math.floor(height * ratio);
    pixelFlowBg.style.width = `${width}px`;
    pixelFlowBg.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw(timeMs) {
    const t = timeMs * 0.0007;
    ctx.clearRect(0, 0, width, height);

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const flow = Math.sin((x * 0.012) + t) + Math.cos((y * 0.014) - t * 1.3);
        const glow = Math.max(0, (flow + 2) / 4);
        if (glow < 0.2) continue;

        const hue = 185 + glow * 40;
        const alpha = 0.08 + glow * 0.24;
        const size = 5 + glow * 7;

        ctx.fillStyle = `hsla(${hue}, 92%, 62%, ${alpha})`;
        ctx.fillRect(x + 4, y + 4, size, size);

        if (glow > 0.65) {
          ctx.shadowColor = `hsla(${hue}, 98%, 70%, 0.75)`;
          ctx.shadowBlur = 10;
          ctx.fillRect(x + 4, y + 4, size, size);
          ctx.shadowBlur = 0;
        }
      }
    }

    animationId = requestAnimationFrame(draw);
  }

  resize();
  animationId = requestAnimationFrame(draw);
  window.addEventListener("resize", resize);
  window.addEventListener("beforeunload", () => cancelAnimationFrame(animationId), { once: true });
}

async function bootstrap() {
  initPixelFlowBackground();
  setVersionText();
  bindEvents();
  await Promise.all([loadRestaurants(), loadSavedInvoices()]);
}

bootstrap();
