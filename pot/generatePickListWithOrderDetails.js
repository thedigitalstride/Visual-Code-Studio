/**
 * Generates a pick list from the "POT Orders" sheet, summarizing items to be picked
 * from orders that haven't been marked as "Despatched." Includes order details grouped by order.
 */
function generatePickListWithOrderDetails() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName("POT Orders");
  const pickListSheetName = "Pick List";

  // Define column names for better maintainability
  const columnNames = {
    item: "Item",
    qty: "QTY",
    dateDespatched: "Date Despatched",
    firstName: "First Name",
    lastName: "Last Name",
    postage: "Postage",
    purchaseDate: "Purchase Date",
    webOrderNumber: "Web Order Number", // Added Web Order Number
  };

  if (!ordersSheet) {
    ui.alert("⚠️ Error: 'POT Orders' sheet not found.");
    return;
  }

  const data = ordersSheet.getDataRange().getValues();
  const headers = data[0];

  // Get column indices based on column names
  const itemColumnIndex = headers.indexOf(columnNames.item);
  const qtyColumnIndex = headers.indexOf(columnNames.qty);
  const dateDespatchedIndex = headers.indexOf(columnNames.dateDespatched);
  const firstNameColumnIndex = headers.indexOf(columnNames.firstName);
  const lastNameColumnIndex = headers.indexOf(columnNames.lastName);
  const postageColumnIndex = headers.indexOf(columnNames.postage);
  const purchaseDateColumnIndex = headers.indexOf(columnNames.purchaseDate);
  const webOrderNumberColumnIndex = headers.indexOf(columnNames.webOrderNumber); // Added Web Order Number

  // Check if all required columns exist
  if (
    itemColumnIndex === -1 ||
    qtyColumnIndex === -1 ||
    dateDespatchedIndex === -1 ||
    firstNameColumnIndex === -1 ||
    lastNameColumnIndex === -1 ||
    postageColumnIndex === -1 ||
    purchaseDateColumnIndex === -1 ||
    webOrderNumberColumnIndex === -1 // Added Web Order Number
  ) {
    ui.alert(
      "⚠️ Error: Column headers not found. Ensure all required columns exist."
    );
    return;
  }

  let skuMap = new Map();
  let orderMap = new Map(); // Map to store orders and their items
  let orderRows = [];

  for (let i = 1; i < data.length; i++) {
    let orderItems = data[i][itemColumnIndex];
    let dateDespatched = data[i][dateDespatchedIndex];
    let qtyValues = data[i][qtyColumnIndex];

    if (!dateDespatched) {
      orderRows.push(i + 1); // Add row number (1-based) to the list of processed rows

      // Clean up the order items string
      orderItems = orderItems.replace(/SKU:\sSKU:/g, "SKU:");

      // Improved SKU parsing: Match until / or end of string
      const skuMatch = orderItems.match(/SKU:\s(.+?)(?:\s\/|$)/);
      if (skuMatch) {
        let skus = skuMatch[1].split(",").map((sku) => sku.trim());
        let itemQuantities = qtyValues.toString().split(",").map(Number);

        // Check for quantity/SKU mismatch
        if (skus.length !== itemQuantities.length) {
          Logger.log(
            `Warning: Mismatched SKU and quantity count in row ${
              i + 1
            }: ${orderItems}`
          );
          // Optionally, alert the user or handle the mismatch in a specific way
        }

        skus.forEach((sku, index) => {
          let quantity = itemQuantities[index] || 1; // Default to 1 if quantity is missing
          skuMap.set(sku, (skuMap.get(sku) || 0) + quantity);

          // Create order key - Now using Web Order Number
          const webOrderNumber = data[i][webOrderNumberColumnIndex];
          const orderKey = webOrderNumber; // Using Web Order Number as the key

          // Add item to orderMap
          if (!orderMap.has(orderKey)) {
            orderMap.set(orderKey, {
              details: [
                data[i][firstNameColumnIndex],
                data[i][lastNameColumnIndex],
                data[i][postageColumnIndex],
                data[i][purchaseDateColumnIndex],
                webOrderNumber, // Added Web Order Number to details
              ],
              items: [],
            });
          }
          orderMap.get(orderKey).items.push([sku, quantity]);
        });
      } else {
        Logger.log(`Warning: Could not parse SKU in row ${i + 1}: ${orderItems}`);
        // Optionally, alert the user or handle the unparseable SKU
      }
    }
  }

  if (skuMap.size === 0) {
    // No unprocessed orders found. No alert needed.
    return;
  }

  let pickListSheet = ss.getSheetByName(pickListSheetName);
  if (pickListSheet) {
    ss.deleteSheet(pickListSheet);
  }

  pickListSheet = ss.insertSheet(pickListSheetName);

  let timestamp = new Date();
  pickListSheet.appendRow(["📅 Updated On:", timestamp]);
  pickListSheet.appendRow(["📋 Order Rows Processed:", orderRows.join(", ")]);
  pickListSheet.appendRow([""]);

  let headerRow = pickListSheet.getLastRow() + 1;

  pickListSheet.appendRow(["SKU", "Quantity"]);

  let sortedSkuList = Array.from(skuMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  let totalItems = 0;
  sortedSkuList.forEach(([sku, qty]) => {
    pickListSheet.appendRow([sku, qty]);
    totalItems += qty;
  });

  pickListSheet.appendRow([""]);
  pickListSheet.appendRow(["🛒 Total Items to Pick:", totalItems]);

  let headerRange = pickListSheet.getRange(headerRow, 1, 1, 2);
  headerRange
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setFontSize(12);
  pickListSheet.getRange("A1:A2").setFontWeight("bold").setFontSize(12);

  let dataRange = pickListSheet.getRange(
    headerRow,
    1,
    sortedSkuList.length + 1,
    2
  );
  dataRange.setBorder(true, true, true, true, true, true);
  pickListSheet.autoResizeColumns(1, 2);
  pickListSheet.setFrozenRows(headerRow);

  // Calculate where to insert the order details header
  let orderDetailsHeaderRow = pickListSheet.getLastRow() + 3; // 3 rows after "Total Items"

  // Insert the empty rows *before* the order details header row
  pickListSheet.insertRowsBefore(orderDetailsHeaderRow, 2);

  pickListSheet.getRange(orderDetailsHeaderRow, 1).setValue("Order Details:"); // Add header

  // Output order details grouped by order
  let orderDetailsDataStartRow = pickListSheet.getLastRow() + 1;
  for (const [orderKey, orderData] of orderMap) {
    // Output order details
    const currentOrderStartRow = pickListSheet.getLastRow() + 1;
    pickListSheet.appendRow(["Web Order Number:", orderKey]); // Added Web Order Number
    pickListSheet.appendRow([
      "First Name",
      "Last Name",
      "Postage",
      "Purchase Date",
    ]);
    pickListSheet.appendRow(orderData.details.slice(0, 4)); // Output the first 4 details
    pickListSheet.appendRow(["SKU", "Quantity"]);

    // Output order items
    orderData.items.forEach((item) => {
      pickListSheet.appendRow(item);
    });

    // Add a more distinct separator between orders
    const currentOrderEndRow = pickListSheet.getLastRow();

    // Apply border to the current order
    pickListSheet.getRange(currentOrderStartRow, 1, currentOrderEndRow - currentOrderStartRow + 1, 6).setBorder(true, true, true, true, true, true);
    
    // Add extra blank rows after each order
    pickListSheet.appendRow([""]); // Add a blank row
    pickListSheet.appendRow([""]); // Add a blank row
    pickListSheet.appendRow([""]); // Add a blank row
  }

  // Format order details table
  let orderDetailsRange = pickListSheet.getRange(
    orderDetailsDataStartRow,
    1,
    pickListSheet.getLastRow() - orderDetailsDataStartRow + 1,
    6
  );
  pickListSheet
    .getRange(orderDetailsHeaderRow, 1, 1, 6)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setFontSize(12);
  pickListSheet.autoResizeColumns(1, 6); // Auto-resize columns AFTER adding data
  pickListSheet.setFrozenRows(orderDetailsDataStartRow); // Freeze the order details header row

  //all formatting is done, *now* send the alert
  ui.alert("✅ Pick List has been successfully updated!");
}
