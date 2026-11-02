import * as vscode from 'vscode';
import { GraphClient } from '../graph/GraphClient';
import { FieldInfo, SchemaCache } from '../types';

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const SCHEMA_CACHE_KEY = 'columnSchemaCache';

export class ColumnSchemaService {
  private schemaCache = new Map<string, SchemaCache>();

  constructor(
    private graphClient: GraphClient,
    private context: vscode.ExtensionContext
  ) {
    this.loadCacheFromState();
  }

  /**
   * Synchronously returns a warm cache entry (if any, and not yet expired)
   * without triggering a network fetch. Lets the panel render instantly with
   * accurate field types/choices on the (common) warm-cache path, instead of
   * always blanking the UI while re-awaiting getColumnSchema.
   */
  peekColumnSchema(siteUrl: string): FieldInfo[] | null {
    const cached = this.schemaCache.get(siteUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.fields;
    }
    return null;
  }

  async getColumnSchema(siteUrl: string, options?: { forceRefresh?: boolean }): Promise<FieldInfo[]> {
    const cached = this.schemaCache.get(siteUrl);

    if (!options?.forceRefresh && cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.fields;
    }

    const fields = await this.fetchSitePageColumns(siteUrl);
    const cacheEntry: SchemaCache = {
      siteUrl,
      fields,
      timestamp: Date.now()
    };

    this.schemaCache.set(siteUrl, cacheEntry);
    this.saveCacheToState();
    return fields;
  }

  private async fetchSitePageColumns(siteUrl: string): Promise<FieldInfo[]> {
    const columns = await this.graphClient.getSitePageListFields(siteUrl);

    // The main fields query above can't safely $select TermSetId/AnchorId
    // (they only exist on the TaxonomyField subtype, and mixing subtype-only
    // properties into a $select across the whole heterogeneous fields
    // collection is unreliable) — fetch those separately, scoped to just the
    // taxonomy fields, via the SharePoint REST API.
    let termSetIdMap: Record<string, { termSetId: string; anchorId?: string }> = {};
    try {
      termSetIdMap = await this.graphClient.getTaxonomyFields(siteUrl);
    } catch (e) {
      // Surface the error so taxonomy field term set IDs are not silently missing
      vscode.window.showWarningMessage(`Could not fetch taxonomy field TermSetIds: ${(e as Error).message}`);
    }

    return columns
      .filter((col: any) => !col.Hidden)
      .map((col: any) => {
        const taxInfo = termSetIdMap[col.InternalName];
        return {
          internalName: col.InternalName,
          title: col.Title,
          description: col.Description,
          TypeAsString: this.normalizeFieldType(col),
          Required: col.Required || false,
          Hidden: col.Hidden || false,
          TermSetId: taxInfo?.termSetId,
          AnchorId: taxInfo?.anchorId,
          choices: col.Choices ?? undefined,
        };
      });
  }

  /**
   * SharePoint REST's TypeAsString already distinguishes single/multi for
   * taxonomy fields (TaxonomyFieldType/TaxonomyFieldTypeMulti) and choice
   * fields (Choice/MultiChoice), but *not* for Person/Group fields — both
   * single and multi Person columns report TypeAsString "User"; whether it's
   * multi-value is a separate boolean, AllowMultipleValues. Reconciles that
   * into this codebase's own 'User'/'UserMulti' convention (see
   * utils/fieldTypes.ts), matching the multi/single distinction the UI
   * actually needs.
   */
  private normalizeFieldType(column: any): string {
    if (column.TypeAsString === 'User') {
      return column.AllowMultipleValues ? 'UserMulti' : 'User';
    }
    if (column.TypeAsString === 'MultiChoice') {
      return 'Choice';
    }
    if (column.TypeAsString === 'LookupMulti') {
      return 'Lookup';
    }
    if (column.TypeAsString === 'Note') {
      return 'Text';
    }
    return column.TypeAsString || 'Text';
  }

  clearCache(siteUrl?: string): void {
    if (siteUrl) {
      this.schemaCache.delete(siteUrl);
    } else {
      this.schemaCache.clear();
    }
    this.saveCacheToState();
  }

  private loadCacheFromState(): void {
    const cached = this.context.workspaceState.get<Record<string, SchemaCache>>(
      SCHEMA_CACHE_KEY
    );
    if (cached) {
      Object.entries(cached).forEach(([key, value]) => {
        this.schemaCache.set(key, value);
      });
    }
  }

  private saveCacheToState(): void {
    const cacheObj: Record<string, SchemaCache> = {};
    this.schemaCache.forEach((value, key) => {
      cacheObj[key] = value;
    });
    this.context.workspaceState.update(SCHEMA_CACHE_KEY, cacheObj);
  }
}
