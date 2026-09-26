import Papa from 'papaparse';
import { db, DEFAULT_WORKSPACE_ID } from './db';
import {
  normalizePhone,
  normalizePrice,
  normalizeDate,
  normalizeText,
  calculateQuotationAgeDays,
  isTrialRecord,
} from './normalizer';
import { SyncRun, Quotation, Temperature } from './types';
import { inferLocationFromText, inferLocationFromPhone } from '../src/utils/locationUtils';

export const REQUIRED_COLUMNS = [
  'id',
  'Timestamp',
  'Client Name',
  'Quotation Price',
  'Sender Name',
  'Pool Dimensions',
  'Pool Type',
  'Contact Number',
  'Status',
] as const;

export interface SyncOptions {
  sheetId?: string;
  sheetGid?: string;
  csvContent?: string;
  workspaceId?: string;
}

export class SyncService {
  /**
   * Fetches raw CSV from Google Sheet URL or custom content
   */
  public static async fetchSheetCsv(sheetId: string, gid = '0'): Promise<string> {
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      sheetId
    )}/export?format=csv&gid=${encodeURIComponent(gid)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Quotation-FollowUp-Manager/1.0',
          Accept: 'text/csv, text/plain, */*',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Google Sheets responded with HTTP ${response.status}: ${response.statusText}. Please verify that the sheet is shared or accessible.`
        );
      }

      return await response.text();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Google Sheets request timed out after 15 seconds.');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Main synchronization routine adhering to PRD Sections 7, 8, 9, 12, 13, 14, 36, 37
   */
  public static async runSync(options?: SyncOptions): Promise<SyncRun> {
    const workspaceId = options?.workspaceId || DEFAULT_WORKSPACE_ID;
    const settings = db.getSettings(workspaceId);

    const sheetId = options?.sheetId || settings.sheet_id;
    const sheetGid = options?.sheetGid || settings.sheet_gid || '0';

    const syncRun = db.createSyncRun(workspaceId);

    try {
      let csvData = options?.csvContent;
      if (!csvData) {
        if (!sheetId) {
          throw new Error('No Google Sheet ID configured.');
        }
        csvData = await this.fetchSheetCsv(sheetId, sheetGid);
      }

      // Parse CSV
      const parseResult = Papa.parse<Record<string, any>>(csvData, {
        header: true,
        skipEmptyLines: 'greedy',
      });

      if (parseResult.errors && parseResult.errors.length > 0) {
        console.warn('CSV parse warnings:', parseResult.errors);
      }

      const rows = parseResult.data;
      const headers = parseResult.meta.fields || [];

      // Validate Header Row (PRD Section 7)
      const missingColumns: string[] = [];
      for (const reqCol of REQUIRED_COLUMNS) {
        // Case-insensitive matching for robustness
        const found = headers.some(
          (h) => h.trim().toLowerCase() === reqCol.toLowerCase()
        );
        if (!found) {
          missingColumns.push(reqCol);
        }
      }

      if (missingColumns.length > 0) {
        throw new Error(
          `Sheet schema validation failed. Missing required columns: ${missingColumns.join(
            ', '
          )}. Expected exactly: ${REQUIRED_COLUMNS.join(', ')}`
        );
      }

      // Map column headers to actual field names in the row
      const colMap: Record<string, string> = {};
      for (const reqCol of REQUIRED_COLUMNS) {
        const matchingHeader = headers.find(
          (h) => h.trim().toLowerCase() === reqCol.toLowerCase()
        );
        colMap[reqCol] = matchingHeader || reqCol;
      }

      const rowsFound = rows.length;
      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      let failedCount = 0;
      const errorDetails: Array<{
        source_id?: string;
        client_name?: string;
        error: string;
        raw?: any;
      }> = [];

      const now = new Date().toISOString();
      const todayStr = now.split('T')[0];
      const seenSourceIds = new Set<string>();

      // Configured follow-up intervals
      const followupDaysConfig = (settings.followup_days || '3,7,14,21,30')
        .split(',')
        .map((n) => parseInt(n.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
      const defaultTime = settings.default_time || '10:30';

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        try {
          const rawId = row[colMap['id']];
          const rawClientName = row[colMap['Client Name']];
          const rawTimestamp = row[colMap['Timestamp']];
          const rawPrice = row[colMap['Quotation Price']];
          const rawSender = row[colMap['Sender Name']];
          const rawDimensions = row[colMap['Pool Dimensions']];
          const rawPoolType = row[colMap['Pool Type']];
          const rawContact = row[colMap['Contact Number']];
          const rawStatus = row[colMap['Status']];

          // Additional Google Sheet columns (FollowUpDate, Temperature, Notes, NextAction)
          const rawFollowUpDate = row['FollowUpDate'] || row['followup_date'] || row['Follow Up Date'];
          const rawTemperature = row['Temperature'] || row['temperature'];
          const rawNotes = row['Notes'] || row['notes'];
          const rawNextAction = row['NextAction'] || row['next_action'];

          const sourceId = normalizeText(rawId);
          if (!sourceId) {
            throw new Error(`Row #${i + 1} has an empty 'id'`);
          }

          const clientName = normalizeText(rawClientName);
          if (!clientName) {
            throw new Error(`Row #${i + 1} (id: ${sourceId}) has an empty 'Client Name'`);
          }

          seenSourceIds.add(sourceId);

          const quotationDate = normalizeDate(rawTimestamp);
          const sheetFollowUpDate = rawFollowUpDate && String(rawFollowUpDate).trim() ? normalizeDate(rawFollowUpDate) : null;
          const quotationPrice = normalizePrice(rawPrice);
          const phoneObj = normalizePhone(rawContact);

          // User request: Don't show "Valued Client" or anyone with 9650081896 in the contact number as they are just trials
          if (isTrialRecord(clientName, phoneObj.normalized, phoneObj.raw)) {
            const existingQuotation = db.findQuotationBySourceId(sourceId, workspaceId);
            if (existingQuotation) {
              db.deleteQuotation(existingQuotation.id, workspaceId);
            }
            continue;
          }

          const poolDimensions = normalizeText(rawDimensions);
          const poolType = normalizeText(rawPoolType);
          const senderName = normalizeText(rawSender);
          const sourceStatus = normalizeText(rawStatus) || 'SENT';

          let initialTemperature: Temperature = 'warm';
          if (rawTemperature) {
            const t = String(rawTemperature).trim().toLowerCase();
            if (t === 'hot' || t === 'cold' || t === 'warm') {
              initialTemperature = t as Temperature;
            }
          }
          const initialNotes = rawNotes && String(rawNotes).trim() ? String(rawNotes).trim() : null;

          const rawLocation = row['Location'] || row['location'] || row['City'] || row['city'] || row['Region'] || row['region'];
          const explicitLocation = normalizeText(rawLocation);
          const inferredLocation =
            explicitLocation ||
            inferLocationFromText(initialNotes) ||
            inferLocationFromText(clientName) ||
            inferLocationFromPhone(phoneObj.raw || phoneObj.normalized);

          // 1. Match or Create Client (PRD Section 19, 20, 21)
          const client = db.upsertClient(
            {
              name: clientName,
              phone: phoneObj.display || phoneObj.normalized,
              contact_number_raw: phoneObj.raw,
              location: inferredLocation || null,
            },
            workspaceId
          );

          // 2. Check if quotation exists by (workspace_id + source_id)
          const existingQuotation = db.findQuotationBySourceId(sourceId, workspaceId);

          if (existingQuotation) {
            // User requested: "also check if the google sheet has been updated and when updated fix it update it here also"
            // Update Google Sheet specifications without overwriting user-managed CRM follow-up stages or private notes
            const { changed } = db.updateQuotationSheetFields(
              existingQuotation.id,
              {
                client_name: clientName,
                quotation_price: quotationPrice,
                sender_name: senderName,
                pool_dimensions: poolDimensions,
                pool_type: poolType,
                contact_number: phoneObj.display || phoneObj.normalized,
                contact_number_raw: phoneObj.raw,
                source_status: sourceStatus,
                source_last_seen_at: now,
                source_updated_at: now,
                source_present: true,
              },
              workspaceId
            );

            if (!existingQuotation.location && inferredLocation) {
              db.updateQuotationAppFields(existingQuotation.id, { location: inferredLocation }, workspaceId);
            }

            if (changed) {
              updatedCount++;
            } else {
              unchangedCount++;
            }
            continue;
          }

          // INSERT new quotation (only when a new quotation is found in the Google Sheet)
          const newQuote = db.insertQuotation(
            {
              workspace_id: workspaceId,
              source_id: sourceId,
              client_id: client.id,
              quotation_date: quotationDate,
              client_name: clientName,
              quotation_price: quotationPrice,
              sender_name: senderName,
              pool_dimensions: poolDimensions,
              pool_type: poolType,
              contact_number: phoneObj.display || phoneObj.normalized,
              contact_number_raw: phoneObj.raw,
              source_status: sourceStatus,
              temperature: initialTemperature,
              priority: 'normal',
              app_status: 'New',
              source_present: true,
              source_last_seen_at: now,
              source_updated_at: now,
              archived_at: null,
              internal_notes: initialNotes,
              location: inferredLocation || null,
            },
            workspaceId
          );

          // 3. Generate Follow-Up for the newly imported quotation
          if (sheetFollowUpDate) {
            db.createFollowUp(
              {
                quotation_id: newQuote.id,
                scheduled_date: sheetFollowUpDate,
                scheduled_time: defaultTime,
                type: 'Call',
                notes: rawNextAction ? rawNextAction.trim() : null,
              },
              workspaceId
            );
          } else {
            const ageDays = calculateQuotationAgeDays(quotationDate);
            // Only create initial follow-up for fresh quotations (within 7 days)
            if (ageDays <= 7) {
              const target = new Date(quotationDate);
              target.setDate(target.getDate() + 3);
              const targetDateStr = target.toISOString().split('T')[0];
              db.createFollowUp(
                {
                  quotation_id: newQuote.id,
                  scheduled_date: targetDateStr,
                  scheduled_time: defaultTime,
                  type: 'Call',
                  notes: null,
                },
                workspaceId
              );
            }
          }

          createdCount++;
        } catch (rowErr: any) {
          failedCount++;
          errorDetails.push({
            source_id: row?.[colMap['id']] || undefined,
            client_name: row?.[colMap['Client Name']] || undefined,
            error: rowErr.message || 'Row processing error',
            raw: row,
          });
        }
      }

      // Determine final sync status
      let finalStatus: SyncRun['status'] = 'completed';
      if (failedCount > 0) {
        finalStatus = createdCount + updatedCount + unchangedCount > 0
          ? 'completed_with_errors'
          : 'failed';
      }

      const completedRun = db.updateSyncRun(
        syncRun.id,
        {
          completed_at: new Date().toISOString(),
          rows_found: rowsFound,
          records_created: createdCount,
          records_updated: updatedCount,
          records_unchanged: unchangedCount,
          records_failed: failedCount,
          status: finalStatus,
          error_details: errorDetails,
          error_message:
            failedCount > 0
              ? `${failedCount} row(s) failed during sync.`
              : null,
        },
        workspaceId
      );

      return completedRun;
    } catch (fatalErr: any) {
      console.error('Fatal sync failure:', fatalErr);
      return db.updateSyncRun(
        syncRun.id,
        {
          completed_at: new Date().toISOString(),
          status: 'failed',
          error_message: fatalErr.message || 'Fatal synchronization failure',
        },
        workspaceId
      );
    }
  }
}
