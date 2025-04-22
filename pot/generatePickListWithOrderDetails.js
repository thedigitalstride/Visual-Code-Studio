/**
 * Generates a pick list from the "POT Orders" sheet, summarizing items to be picked
 * from orders that haven't been marked as "Despatched." Includes order details grouped by order.
 */
function generatePickListWithVisualCards() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName("POT Orders");
  const pickListSheetName = "Pick List";

  const columnNames = {
    item: "Item",
    qty: "QTY",
    dateDespatched: "Date Despatched",
    firstName: "First Name",
    lastName: "Last Name",
    postage: "Postage",
    purchaseDate: "Purchase Date",
    webOrderNumber: "Web Order Number",
  };

  if (!ordersSheet) {
    ui.alert("⚠️ Error: 'POT Orders' sheet not found.");
    return;
  }

  const data = ordersSheet.getDataRange().getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase());
  const getColumnIndex = (colName) => headers.indexOf(colName.toLowerCase());

  const itemIndex = getColumnIndex(columnNames.item);
  const qtyIndex = getColumnIndex(columnNames.qty);
  const despatchIndex = getColumnIndex(columnNames.dateDespatched);
  const firstNameIndex = getColumnIndex(columnNames.firstName);
  const lastNameIndex = getColumnIndex(columnNames.lastName);
  const postageIndex = getColumnIndex(columnNames.postage);
  const purchaseDateIndex = getColumnIndex(columnNames.purchaseDate);
  const orderNumIndex = getColumnIndex(columnNames.webOrderNumber);

  if ([itemIndex, qtyIndex, despatchIndex, firstNameIndex, lastNameIndex,
      postageIndex, purchaseDateIndex, orderNumIndex].includes(-1)) {
    ui.alert("⚠️ Error: Column headers not found. Check header names.");
    return;
  }

  let orderMap = new Map();
  let skuMap = new Map();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[despatchIndex]) continue;

    const orderItemsRaw = row[itemIndex]?.toString().replace(/SKU:\sSKU:/g, "SKU:");
    const skuMatch = orderItemsRaw.match(/SKU:\s(.+?)(?:\s\/|$)/);
    if (!skuMatch) continue;

    const skus = skuMatch[1].split(",").map(s => s.trim());
    const quantities = row[qtyIndex].toString().split(",").map(q => parseInt(q.trim()) || 1);
    const orderKey = row[orderNumIndex];

    if (!orderMap.has(orderKey)) {
      orderMap.set(orderKey, {
        name: `${row[firstNameIndex]} ${row[lastNameIndex]}`,
        postage: row[postageIndex],
        purchaseDate: row[purchaseDateIndex],
        items: []
      });
    }

    skus.forEach((sku, index) => {
      const qty = quantities[index] || 1;
      orderMap.get(orderKey).items.push([sku, qty]);
      skuMap.set(sku, (skuMap.get(sku) || 0) + qty);
    });
  }

  // Remove old sheet and create new one
  let pickListSheet = ss.getSheetByName(pickListSheetName);
  if (pickListSheet) ss.deleteSheet(pickListSheet);
  pickListSheet = ss.insertSheet(pickListSheetName);

  // Timestamp
  pickListSheet.appendRow(["📦 Pick List Generated:", new Date()]);
  pickListSheet.appendRow([""]);

  // 🔢 SKU Aggregated Picking List
  pickListSheet.appendRow(["📋 Components to Pick"]);
  pickListSheet.appendRow(["SKU", "Quantity"]);
  const startRow = pickListSheet.getLastRow();

  let totalQty = 0;
  const sortedSkus = Array.from(skuMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  sortedSkus.forEach(([sku, qty]) => {
    pickListSheet.appendRow([sku, qty]);
    totalQty += qty;
  });

  pickListSheet.appendRow([""]);
  pickListSheet.appendRow(["🧮 Total Components:", totalQty]);

  // Format picking list
  pickListSheet.getRange(startRow, 1, sortedSkus.length + 1, 2).setBorder(true, true, true, true, true, true);
  pickListSheet.getRange(startRow, 1, 1, 2).setFontWeight("bold").setFontSize(12).setHorizontalAlignment("center");
  pickListSheet.autoResizeColumns(1, 2);

  // Add spacing before order cards
  pickListSheet.appendRow([""]);
  pickListSheet.appendRow(["🧾 Order Details"]);
  pickListSheet.appendRow([""]);
  let currentRow = pickListSheet.getLastRow() + 1;

  // 🧾 Visual Order Cards
  for (const [orderNum, order] of orderMap.entries()) {
    const startCardRow = currentRow;

    pickListSheet.getRange(currentRow++, 1).setValue(`🧾 Web Order Number: ${orderNum}`).setFontWeight("bold");
    pickListSheet.getRange(currentRow++, 1).setValue(`👤 ${order.name}`);
    pickListSheet.getRange(currentRow++, 1).setValue(`📦 Postage: ${order.postage}`);
    pickListSheet.getRange(currentRow++, 1).setValue(`🕓 Purchase Date: ${order.purchaseDate}`);
    pickListSheet.getRange(currentRow++, 1).setValue(`🛒 Items:`).setFontWeight("bold");

    let orderTotal = 0;
    order.items.forEach(([sku, qty]) => {
      pickListSheet.getRange(currentRow++, 1).setValue(`- ${sku} x${qty}`);
      orderTotal += qty;
    });
    pickListSheet.getRange(currentRow++, 1).setValue(`Total Items: ${orderTotal}`).setFontWeight("bold");

    // Card border
    const cardHeight = currentRow - startCardRow;
    const cardRange = pickListSheet.getRange(startCardRow, 1, cardHeight, 1);
    cardRange.setBorder(true, true, true, true, true, true);
    pickListSheet.getRange(startCardRow, 1, 1, 1).setBackground("#f1f3f4");
    pickListSheet.getRange(startCardRow, 1, cardHeight, 1).setFontSize(11);
    pickListSheet.getRange(currentRow -1, 1, 1, 1).setBorder(null, null, true, null, null, null).setBorder(null, null, true, null, false, null, "black", SpreadsheetApp.BorderStyle.THICK); // Add thick bottom border

    currentRow++;
    Logger.log(`Order ${orderNum} starts at row ${startCardRow} and ends at row ${currentRow -1}`);
  }

  pickListSheet.autoResizeColumn(1);
  ui.alert("✅ Pick List has been successfully created with both picking summary and visual order cards.");
}
