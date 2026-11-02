import * as vscode from 'vscode';
import { GraphClient } from './GraphClient';
import { TermInfo, TermStoreCache } from '../types';

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

function flattenTree(nodes: TermInfo[], depth: number): TermInfo[] {
  const result: TermInfo[] = [];
  for (const node of nodes) {
    result.push({ ...node, depth, children: node.children });
    if (node.children && node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

export class TermStoreService {
  private termCache = new Map<string, TermStoreCache>();

  constructor(
    private graphClient: GraphClient,
    private context: vscode.ExtensionContext
  ) {
    this.loadCacheFromState();
  }

  async getTerms(termSetId: string, siteUrl: string, anchorId?: string, options?: { forceRefresh?: boolean }): Promise<TermInfo[]> {
    const normalizedSetId = (termSetId || '').trim();
    if (!normalizedSetId) {
      throw new Error('Cannot load terms: invalid term set id');
    }
    // Cache key includes anchorId so different anchors on the same set are cached separately
    const cacheKey = `${siteUrl}:${normalizedSetId}${anchorId ? `:${anchorId}` : ''}`;
    const cached = this.termCache.get(cacheKey);

    if (!options?.forceRefresh && cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.terms;
    }

    let terms: any[];
    try {
      terms = await this.graphClient.getTermsRecursive(normalizedSetId, siteUrl, anchorId);
    } catch (error: any) {
      const status = error?.response?.status;
      const endpoint = error?.config?.url;
      throw new Error(
        `Failed to load terms for term set "${normalizedSetId}" (site "${siteUrl}")${status ? ` [HTTP ${status}]` : ''}${endpoint ? ` from ${endpoint}` : ''}`,
        { cause: error }
      );
    }

    // Build a tree from the flat list returned by fetchTermsRecursiveRest.
    // Each item has an optional _parentId set by the recursive fetcher.
    const byId = new Map<string, TermInfo>();
    for (const t of terms) {
      byId.set(t.id, {
        id: t.id,
        labels: t.labels || [],
        isDeprecated: t.isDeprecated || false,
        children: []
      });
    }
    const roots: TermInfo[] = [];
    for (const t of terms) {
      const node = byId.get(t.id)!;
      const parentId = t._parentId;
      if (parentId && byId.has(parentId)) {
        byId.get(parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }

    // Flatten tree depth-first, storing depth on each node
    const formattedTerms = flattenTree(roots, 0);

    const cacheEntry: TermStoreCache = {
      termSetId: normalizedSetId,
      terms: formattedTerms,
      timestamp: Date.now()
    };

    this.termCache.set(cacheKey, cacheEntry);
    this.saveCacheToState();
    return formattedTerms;
  }

  clearCache(termSetId?: string): void {
    if (termSetId) {
      const keysToDelete = Array.from(this.termCache.keys()).filter((key) =>
        key.endsWith(`:${termSetId}`)
      );
      keysToDelete.forEach((key) => this.termCache.delete(key));
    } else {
      this.termCache.clear();
    }
    this.saveCacheToState();
  }

  private loadCacheFromState(): void {
    const cached = this.context.workspaceState.get<Record<string, TermStoreCache>>(
      'termStoreCache'
    );
    if (cached) {
      Object.entries(cached).forEach(([key, value]) => {
        this.termCache.set(key, value);
      });
    }
  }

  private saveCacheToState(): void {
    const cacheObj: Record<string, TermStoreCache> = {};
    this.termCache.forEach((value, key) => {
      cacheObj[key] = value;
    });
    this.context.workspaceState.update('termStoreCache', cacheObj);
  }
}
