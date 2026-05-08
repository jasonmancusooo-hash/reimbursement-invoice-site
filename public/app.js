const APP_VERSION = "1.1";

let restaurants = {};

const categoryLabels = {
  dishes: "菜品",
  staple: "主食",
  drinks: "饮品",
  soup: "汤品"
};

const state = {
  currentRestaurant: "arabic",
  currentCategory: "dishes",
  cart: [],
  template: "classic",
  savedInvoices: [],
  storageMode: "api"
};

const isVercelHost = window.location.hostname.endsWith("vercel.app");

const landingPage = document.getElementById("landingPage");
const appRoot = document.getElementById("appRoot");
const enterSystemBtn = document.getElementById("enterSystemBtn");
const exitBtn = document.getElementById("exitBtn");
const versionInfo = document.getElementById("versionInfo");
const versionInfoLanding = document.getElementById("versionInfoLanding");

const confirmModal = document.getElementById("confirmModal");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");
const modalConfirm = document.getElementById("modalConfirm");
const modalCancel = document.getElementById("modalCancel");

const tabWrap = document.getElementById("restaurantTabs");
const categoryTabs = document.getElementById("categoryTabs");
const menuGrid = document.getElementById("menuGrid");
const cartList = document.getElementById("cartList");
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

function showModal({ title, message, confirmText = "是", cancelText = "否" }) {
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalConfirm.textContent = confirmText;
  modalCancel.textContent = cancelText;
  confirmModal.classList.remove("hidden");

  return new Promise((resolve) => {
    const cleanup = () => {
      confirmModal.classList.add("hidden");
      modalConfirm.removeEventListener("click", onConfirm);
      modalCancel.removeEventListener("click", onCancel);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    modalConfirm.addEventListener("click", onConfirm);
    modalCancel.addEventListener("click", onCancel);
  });
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

function clearCurrentMenu() {
  state.cart = [];
  renderCart();
}

function setDefaultRestaurantNameByRestaurantKey(restaurantKey) {
  const current = (invoiceForm.elements.restaurantName.value || "").trim();
  if (restaurantKey === "sichuan" && current === "") {
    invoiceForm.elements.restaurantName.value = "Al Noor Hosting Company";
  }
}

function toTemplateDate(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${Number(day)}/${Number(month)}/${year}`;
}

function getLocalInvoices() {
  try {
    const raw = localStorage.getItem("saved_invoices_v11");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalInvoices(invoices) {
  localStorage.setItem("saved_invoices_v11", JSON.stringify(invoices));
}

function applyInvoiceToCurrentView(invoice) {
  state.currentRestaurant = invoice.restaurantKey || state.currentRestaurant;
  if (!restaurants[state.currentRestaurant]) {
    state.currentRestaurant = Object.keys(restaurants)[0];
  }

  const categories = restaurants[state.currentRestaurant]?.categories || ["dishes"];
  state.currentCategory = categories[0];
  state.cart = invoice.items || [];

  if (invoice.invoiceNo) invoiceForm.elements.invoiceNo.value = invoice.invoiceNo;
  if (invoice.invoiceDate) invoiceForm.elements.invoiceDate.value = invoice.invoiceDate;
  if (invoice.payer) invoiceForm.elements.payer.value = invoice.payer;
  if (invoice.taxNo) invoiceForm.elements.taxNo.value = invoice.taxNo;
  if (invoice.project) invoiceForm.elements.project.value = invoice.project;
  if (invoice.handler) invoiceForm.elements.handler.value = invoice.handler;
  if (invoice.note) invoiceForm.elements.note.value = invoice.note;
  if (invoice.restaurantName) invoiceForm.elements.restaurantName.value = invoice.restaurantName;
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
    state.currentRestaurant = Object.keys(restaurants)[0];
  }
  const categories = restaurants[state.currentRestaurant]?.categories || ["dishes"];
  state.currentCategory = categories[0];
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
  Object.entries(restaurants).forEach(([key, restaurant]) => {
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

async function addToCart(item) {
  const hasCrossRestaurantItems = state.cart.some((row) => row.restaurant !== state.currentRestaurant);
  if (hasCrossRestaurantItems) {
    const confirmed = await showModal({
      title: "切换餐厅",
      message: "如果切换餐厅将清空当前菜单，是否继续？"
    });
    if (!confirmed) return;
    clearCurrentMenu();
  }

  const found = state.cart.find((row) => row.id === item.id);
  if (found) {
    found.qty += 1;
  } else {
    state.cart.push({
      id: item.id,
      category: item.category,
      restaurant: state.currentRestaurant,
      displayName: getDisplayName(item, state.currentRestaurant),
      exportName: getExportName(item, state.currentRestaurant),
      price: item.price,
      qty: 1
    });
  }
  renderCart();
}

function renderMenu() {
  const query = searchInput.value.trim().toLowerCase();
  const items = restaurants[state.currentRestaurant]?.items || [];
  const list = items.filter((item) => {
    const displayName = getDisplayName(item, state.currentRestaurant).toLowerCase();
    return item.category === state.currentCategory && displayName.includes(query);
  });

  menuGrid.innerHTML = "";
  list.forEach((item) => {
    const card = document.createElement("div");
    card.className = "menu-item";
    card.innerHTML = `
      <div>
        <div><strong>${getDisplayName(item, state.currentRestaurant)}</strong></div>
        <div>¥ ${item.price.toFixed(2)}</div>
      </div>
      <button>加入</button>
    `;
    card.querySelector("button").onclick = async () => addToCart(item);
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
    line.innerHTML = `
      <span>${row.displayName} × ${row.qty}</span>
      <strong>¥ ${(row.price * row.qty).toFixed(2)}</strong>
      <button data-index="${index}">删除</button>
    `;
    line.querySelector("button").onclick = () => {
      state.cart.splice(index, 1);
      renderCart();
    };
    cartList.appendChild(line);
  });

  const subtotal = state.cart.reduce((sum, row) => sum + row.price * row.qty, 0);
  const taxRate = Number(taxRateEl.value || 0) / 100;
  const grandTotal = subtotal * (1 + taxRate);

  subtotalEl.textContent = `¥ ${subtotal.toFixed(2)}`;
  grandTotalEl.textContent = `¥ ${grandTotal.toFixed(2)}`;
  renderPreview();
}

function getInvoiceData() {
  const subtotal = state.cart.reduce((sum, row) => sum + row.price * row.qty, 0);
  const taxRate = Number(taxRateEl.value || 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

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
    subtotal,
    taxRate,
    taxAmount,
    total,
    template: state.template
  };
}

function renderPreview() {
  const data = getInvoiceData();
  invoicePreview.className = `invoice-preview ${state.template}`;

  const itemsHtml = state.cart
    .map((row) => `<tr><td>${row.displayName}</td><td>${row.qty}</td><td>¥ ${row.price.toFixed(2)}</td><td>¥ ${(row.price * row.qty).toFixed(2)}</td></tr>`)
    .join("");

  invoicePreview.innerHTML = `
    <h3>发票预览 - ${state.template}</h3>
    <p><strong>发票号：</strong>${data.invoiceNo}</p>
    <p><strong>开票日期：</strong>${data.invoiceDate}</p>
    <p><strong>付款方：</strong>${data.payer}</p>
    <p><strong>税号：</strong>${data.taxNo}</p>
    <p><strong>报销项目：</strong>${data.project} | <strong>经办人：</strong>${data.handler}</p>
    <p><strong>餐厅：</strong>${data.restaurant}</p>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr><th align="left">品名</th><th>数量</th><th>单价</th><th>小计</th></tr>
      </thead>
      <tbody>${itemsHtml || "<tr><td colspan='4'>暂无项目</td></tr>"}</tbody>
    </table>
    <p><strong>未税金额：</strong>¥ ${data.subtotal.toFixed(2)}</p>
    <p><strong>税额(${data.taxRate}%):</strong>¥ ${data.taxAmount.toFixed(2)}</p>
    <p><strong>合计：</strong>¥ ${data.total.toFixed(2)}</p>
    <p><strong>备注：</strong>${data.note}</p>
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

    const itemBtn = document.createElement("button");
    itemBtn.className = "saved-item";
    itemBtn.textContent = `${invoice.invoiceNo} | ${invoice.restaurant} | ${invoice.invoiceDate}`;
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
      const confirmed = await showModal({
        title: "删除确认",
        message: "是否删除这条已保存发票？"
      });
      if (!confirmed) return;
      if (state.storageMode === "api") {
        try {
          const response = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
          if (!response.ok) throw new Error("api delete failed");
        } catch {
          state.storageMode = "local";
          const localInvoices = getLocalInvoices().filter((row) => row.id !== invoice.id);
          setLocalInvoices(localInvoices);
        }
      } else {
        const localInvoices = getLocalInvoices().filter((row) => row.id !== invoice.id);
        setLocalInvoices(localInvoices);
      }
      await loadSavedInvoices();
    };

    wrap.appendChild(itemBtn);
    wrap.appendChild(deleteBtn);
    savedInvoicesEl.appendChild(wrap);
  });
}

async function saveInvoiceToServer() {
  const data = getInvoiceData();
  if (!data.items.length) {
    await showModal({
      title: "无法保存",
      message: "请先选择菜品再保存发票",
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
  const confirmed = await showModal({
    title: "保存发票",
    message: "是否临时保存当前发票并清空选项？"
  });
  if (!confirmed) return;

  const saved = await saveInvoiceToServer();
  if (!saved) return;

  clearCurrentMenu();
  await showModal({
    title: "保存成功",
    message: `发票已保存，记录ID: ${saved.id}`,
    confirmText: "好的",
    cancelText: "关闭"
  });
}

async function onExportClick() {
  const data = getInvoiceData();
  if (!data.items.length) {
    await showModal({
      title: "无法导出",
      message: "请先选择菜品再导出发票",
      confirmText: "确定",
      cancelText: "关闭"
    });
    return;
  }

  const needSave = await showModal({
    title: "导出发票",
    message: "即将导出发票excel，是否需要保存当前菜单？"
  });

  if (needSave) {
    const saved = await saveInvoiceToServer();
    if (!saved) return;
  } else {
    clearCurrentMenu();
  }

  const rows = [
    ["发票号", data.invoiceNo],
    ["开票日期", data.invoiceDate],
    ["付款方", data.payer],
    ["税号", data.taxNo],
    ["报销项目", data.project],
    ["经办人", data.handler],
    ["餐厅", data.restaurant],
    ["税率(%)", data.taxRate],
    ["未税金额", data.subtotal],
    ["税额", data.taxAmount],
    ["合计", data.total],
    ["备注", data.note],
    [],
    ["明细"],
    ["Item Name", "Qty", "Unit Price", "Amount"]
  ];

  data.items.forEach((row) => {
    rows.push([row.exportName, row.qty, row.price, row.price * row.qty]);
  });

  if (window.XLSX) {
    try {
      const response = await fetch("/templates/invoice-template.xlsx");
      if (!response.ok) throw new Error("template fetch failed");
      const buffer = await response.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellStyles: true });
      const sheetName = wb.SheetNames[1];
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error("sheet2 missing");

      ws.G4 = { t: "s", v: `Date: ${toTemplateDate(data.invoiceDate)}` };
      if ((data.restaurantName || "").trim()) {
        ws.G2 = { t: "s", v: data.restaurantName.trim() };
      }

      for (let row = 17; row <= 33; row += 1) {
        ws[`D${row}`] = { t: "s", v: "" };
        ws[`E${row}`] = { t: "n", v: 0 };
        ws[`F${row}`] = { t: "n", v: 0 };
      }

      const maxRows = 17;
      data.items.slice(0, maxRows).forEach((item, index) => {
        const row = 17 + index;
        ws[`D${row}`] = { t: "s", v: item.exportName };
        ws[`E${row}`] = { t: "n", v: item.qty };
        ws[`F${row}`] = { t: "n", v: item.price };
      });

      XLSX.writeFile(wb, `${data.invoiceNo || "invoice"}.xlsx`);
      return;
    } catch {
      // Fall back to CSV export if template loading fails.
    }
  }

  const csvRows = rows.map((columns) =>
    columns
      .map((value) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`)
      .join(",")
  );
  const csvBlob = new Blob([csvRows.join("\\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(csvBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${data.invoiceNo || "invoice"}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  await showModal({
    title: "导出提示",
    message: "Excel 组件未加载，已自动导出 CSV 文件。",
    confirmText: "知道了",
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
  renderSavedInvoices();
  renderCart();
  appRoot.classList.add("hidden");
  landingPage.classList.remove("hidden");
}

function bindEvents() {
  enterSystemBtn.addEventListener("click", () => {
    landingPage.classList.add("hidden");
    appRoot.classList.remove("hidden");
  });

  exitBtn.addEventListener("click", onExitSite);

  window.addEventListener("beforeunload", (event) => {
    event.preventDefault();
    event.returnValue = "每一次退出网站，当前已保存将清空，是否退出？";
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
}

async function bootstrap() {
  setVersionText();
  bindEvents();
  await Promise.all([loadRestaurants(), loadSavedInvoices()]);
}

bootstrap();
