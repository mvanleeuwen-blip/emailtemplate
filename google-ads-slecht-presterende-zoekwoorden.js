/**
 * Google Ads Script: Slecht presterende zoekwoorden per campagne
 *
 * Vindt zoekwoorden die wél kliks/kosten hebben opgeleverd maar niet
 * converteren, gegroepeerd per campagne. Resultaat gaat naar e-mail
 * en/of een Google Sheet.
 *
 * Installatie:
 * 1. Google Ads > Tools & Settings > Bulk Actions > Scripts > "+"
 * 2. Plak deze code, pas de CONFIG hieronder aan naar wens.
 * 3. Autoriseer het script en draai het (of zet een schema, bv. wekelijks).
 */

var CONFIG = {
  // Periode om te analyseren: LAST_7_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, ...
  DATE_RANGE: 'LAST_30_DAYS',

  // Een zoekwoord wordt alleen gerapporteerd als het geen conversies heeft
  // ÉN aan minstens één van onderstaande drempels voldoet.
  MIN_CLICKS: 10,
  MIN_COST: 20, // in accountvaluta

  SEND_EMAIL: true,
  EMAIL_RECIPIENTS: ['m.vanleeuwen@jobster.com'],
  EMAIL_SUBJECT_PREFIX: 'Google Ads - Slecht presterende zoekwoorden',

  // Zet op true om de resultaten ook in een Google Sheet te zetten.
  // Laat SHEET_ID leeg om automatisch een nieuwe sheet aan te maken.
  // Het ID staat in de sheet-URL: .../spreadsheets/d/DIT-STUK/edit...
  WRITE_TO_SHEET: true,
  SHEET_ID: '1L-nJ-di54RZ9w6OL40aniYVVUIcg8TVpyYWV6wIQYn4'
};

function main() {
  var results = {};
  var totalFlagged = 0;

  var campaignIterator = AdsApp.campaigns()
    .withCondition("Status = ENABLED")
    .get();

  while (campaignIterator.hasNext()) {
    var campaign = campaignIterator.next();
    var rows = collectPoorKeywords(campaign);

    if (rows.length > 0) {
      rows.sort(function(a, b) { return b.cost - a.cost; });
      results[campaign.getName()] = rows;
      totalFlagged += rows.length;
    }
  }

  if (totalFlagged === 0) {
    Logger.log('Geen slecht presterende zoekwoorden gevonden voor ' + CONFIG.DATE_RANGE + '.');
    return;
  }

  Logger.log(totalFlagged + ' slecht presterende zoekwoorden gevonden in ' +
    Object.keys(results).length + ' campagne(s).');

  if (CONFIG.WRITE_TO_SHEET) {
    writeToSheet(results);
  }

  if (CONFIG.SEND_EMAIL) {
    sendEmailReport(results, totalFlagged);
  }
}

function collectPoorKeywords(campaign) {
  var rows = [];

  var keywordIterator = campaign.keywords()
    .withCondition("Status = ENABLED")
    .get();

  while (keywordIterator.hasNext()) {
    var keyword = keywordIterator.next();
    var stats = keyword.getStatsFor(CONFIG.DATE_RANGE);

    var clicks = stats.getClicks();
    var cost = stats.getCost();
    var conversions = stats.getConversions();

    var meetsThreshold = clicks >= CONFIG.MIN_CLICKS || cost >= CONFIG.MIN_COST;
    var hasNoConversions = conversions < 0.01;

    if (meetsThreshold && hasNoConversions) {
      rows.push({
        keyword: keyword.getText(),
        matchType: keyword.getMatchType(),
        adGroup: keyword.getAdGroup().getName(),
        clicks: clicks,
        impressions: stats.getImpressions(),
        ctr: stats.getCtr(),
        cost: cost,
        avgCpc: stats.getAverageCpc()
      });
    }
  }

  return rows;
}

function writeToSheet(results) {
  var ss = CONFIG.SHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SHEET_ID)
    : SpreadsheetApp.create('Slecht presterende zoekwoorden - ' + formatDate(new Date()));

  if (!CONFIG.SHEET_ID) {
    Logger.log('Nieuwe sheet aangemaakt: ' + ss.getUrl());
  }

  var sheet = ss.getSheets()[0];
  sheet.clearContents();
  sheet.appendRow(['Campagne', 'Advertentiegroep', 'Zoekwoord', 'Matchtype',
    'Clicks', 'Impressies', 'CTR', 'Kosten', 'Gem. CPC']);

  Object.keys(results).forEach(function(campaignName) {
    results[campaignName].forEach(function(row) {
      sheet.appendRow([campaignName, row.adGroup, row.keyword, row.matchType,
        row.clicks, row.impressions, row.ctr, row.cost, row.avgCpc]);
    });
  });

  sheet.autoResizeColumns(1, 9);
}

function sendEmailReport(results, totalFlagged) {
  var periodLabel = CONFIG.DATE_RANGE.replace(/_/g, ' ').toLowerCase();

  var html = '<html><body style="font-family:Arial,sans-serif;color:#222;">';
  html += '<h2>Slecht presterende zoekwoorden (' + periodLabel + ')</h2>';
  html += '<p>' + totalFlagged + ' zoekwoorden zonder conversie, met minimaal ' +
    CONFIG.MIN_CLICKS + ' clicks of ' + CONFIG.MIN_COST + ' kosten.</p>';

  Object.keys(results).forEach(function(campaignName) {
    html += '<h3 style="margin-top:24px;border-bottom:2px solid #4285F4;padding-bottom:4px;">' +
      escapeHtml(campaignName) + '</h3>';
    html += '<table style="border-collapse:collapse;width:100%;font-size:13px;">';
    html += '<tr style="background:#f1f3f4;text-align:left;">' +
      '<th style="padding:6px;border:1px solid #ddd;">Advertentiegroep</th>' +
      '<th style="padding:6px;border:1px solid #ddd;">Zoekwoord</th>' +
      '<th style="padding:6px;border:1px solid #ddd;">Matchtype</th>' +
      '<th style="padding:6px;border:1px solid #ddd;text-align:right;">Clicks</th>' +
      '<th style="padding:6px;border:1px solid #ddd;text-align:right;">CTR</th>' +
      '<th style="padding:6px;border:1px solid #ddd;text-align:right;">Kosten</th>' +
      '<th style="padding:6px;border:1px solid #ddd;text-align:right;">Gem. CPC</th>' +
      '</tr>';

    results[campaignName].forEach(function(row, i) {
      var bg = i % 2 === 0 ? '#ffffff' : '#fafafa';
      html += '<tr style="background:' + bg + ';">' +
        '<td style="padding:6px;border:1px solid #ddd;">' + escapeHtml(row.adGroup) + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd;"><strong>' + escapeHtml(row.keyword) + '</strong></td>' +
        '<td style="padding:6px;border:1px solid #ddd;">' + row.matchType + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd;text-align:right;">' + row.clicks + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd;text-align:right;">' + (row.ctr * 100).toFixed(2) + '%</td>' +
        '<td style="padding:6px;border:1px solid #ddd;text-align:right;">&euro;' + row.cost.toFixed(2) + '</td>' +
        '<td style="padding:6px;border:1px solid #ddd;text-align:right;">&euro;' + row.avgCpc.toFixed(2) + '</td>' +
        '</tr>';
    });

    html += '</table>';
  });

  html += '</body></html>';

  MailApp.sendEmail({
    to: CONFIG.EMAIL_RECIPIENTS.join(','),
    subject: CONFIG.EMAIL_SUBJECT_PREFIX + ' - ' + formatDate(new Date()),
    htmlBody: html
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(date) {
  return Utilities.formatDate(date, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
}
