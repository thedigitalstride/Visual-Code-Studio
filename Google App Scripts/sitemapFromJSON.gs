/**
 * Creates a structured sitemap in Google Sheets from a JSON sitemap uploaded by the user.
 *
 * This script reads a JSON sitemap (uploaded by the user) and organizes
 * the URLs into a hierarchical structure in a Google Sheet. It extracts
 * the main categories and subcategories from the URLs to create a clear
 * and organized sitemap.
 */

/**
 * Adds a custom menu to the spreadsheet.
 *
 * This function is automatically called when the spreadsheet is opened.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Sitemap Tools')
      .addItem('Create/Update Sitemap', 'createStructuredSitemap')
      .addToUi();
}

function createStructuredSitemap() {
  // --- Configuration ---
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = "Sitemap"; // Name of the sheet to create/update
  // --- End Configuration ---

  // Show "Running" modal
  const runningHtml = HtmlService.createHtmlOutput('<p>Running... Please wait.</p>')
      .setWidth(200)
      .setHeight(100);
  const runningDialog = SpreadsheetApp.getUi().showModalDialog(runningHtml, 'Processing');

  // Get or create the sheet
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clearContents(); // Clear existing data
  }

  // Set headers
  const headers = ["Category", "Subcategory", "Page URL"];
  sheet.appendRow(headers);

  // --- Upload JSON Data ---
  const jsonData = uploadJsonFile();
  if (!jsonData) {
    SpreadsheetApp.getUi().alert("Error: Could not upload JSON data. Please upload a valid JSON file.");
    SpreadsheetApp.getUi().close();
    return;
  }

  // --- Process JSON Data ---
  const sitemapData = processSitemapData(jsonData);

  // --- Write to Sheet ---
  writeSitemapToSheet(sheet, sitemapData);

  // Close the "Running" modal
  SpreadsheetApp.getUi().close();
  SpreadsheetApp.getUi().alert("Sitemap created/updated successfully!");
}

/**
 * Processes the sitemap data to extract categories and subcategories.
 *
 * @param {Array<string>} urls - An array of URLs from the sitemap.
 * @return {Array<Array<string>>} - An array of rows to be written to the sheet.
 */
function processSitemapData(urls) {
  const sitemapData = [];
  const baseUrl = "https://www.360interiors.co.uk";

  urls.forEach(url => {
    if (url === baseUrl) {
      sitemapData.push(["Home", "", url]);
    } else {
      const path = url.replace(baseUrl, "");
      const pathParts = path.split("/").filter(part => part !== "");

      if (pathParts.length === 1) {
        sitemapData.push([pathParts[0].replace("-", " ").toUpperCase(), "", url]);
      } else if (pathParts.length > 1) {
        sitemapData.push([pathParts[0].replace("-", " ").toUpperCase(), pathParts[1].replace("-", " ").toUpperCase(), url]);
      }
    }
  });
  return sitemapData;
}

/**
 * Writes the processed sitemap data to the Google Sheet.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to write to.
 * @param {Array<Array<string>>} data - The data to write.
 */
function writeSitemapToSheet(sheet, data) {
  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
  }
}

/**
 * Uploads a JSON file from the user's computer and returns the parsed JSON data.
 *
 * @return {object|null} - The parsed JSON data or null if an error occurs.
 */
function uploadJsonFile() {
  const html = HtmlService.createHtmlOutputFromFile('upload')
      .setWidth(400)
      .setHeight(200);
  SpreadsheetApp.getUi()
      .showModalDialog(html, 'Upload JSON File');
  
  // Wait for the user to upload the file.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // Wait for 30 seconds for the file to be uploaded.
  
  const properties = PropertiesService.getScriptProperties();
  const jsonData = properties.getProperty('jsonData');
  properties.deleteProperty('jsonData');
  
  if (jsonData) {
    try {
      return JSON.parse(jsonData);
    } catch (e) {
      SpreadsheetApp.getUi().alert("Error: Invalid JSON format. Please upload a valid JSON file.");
      return null;
    }
  } else {
    return null;
  }
}

/**
 * This function is called from the HTML file to store the JSON data in the script properties.
 *
 * @param {string} jsonString - The JSON data as a string.
 */
function storeJsonData(jsonString) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('jsonData', jsonString);
  
  // Release the lock.
  const lock = LockService.getScriptLock();
  lock.releaseLock();
}
