/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import crypto from 'crypto';
import { ApiSite } from '@/lib/config';
import { SearchResult } from '@/lib/types';
import { cleanHtmlTags } from '@/lib/utils';
import { decorateSearchResultQuality } from '@/lib/video-quality';
import { SourceProvider } from '@/lib/providers/types';

export class AppGetProvider implements SourceProvider {
  name = 'appget';

  canHandle(site: ApiSite): boolean {
    const type = site.type?.toLowerCase() || '';
    const hasAesKey = typeof site.ext === 'object' && site.ext?.dataKey;
    const api = (site.api || '').toLowerCase();
    const key = (site.key || '').toLowerCase();
    const name = (site.name || '').toLowerCase();

    return (
      type === 'appget' ||
      type === 'appqi' ||
      hasAesKey ||
      key.includes('王子') ||
      key.includes('魔方') ||
      key.includes('世界') ||
      key.includes('茉莉') ||
      name.includes('王子') ||
      name.includes('魔方') ||
      name.includes('世界') ||
      api.includes('95112475.xyz') ||
      api.includes('douy32mf.top') ||
      api.includes('4ksj.app')
    );
  }

  private getKeys(site: ApiSite): { key: Buffer; iv: Buffer } {
    let keyStr = '5a9w6x58dsq6z3a6';
    let ivStr = '5a9w6x58dsq6z3a6';

    if (typeof site.ext === 'object' && site.ext) {
      if (site.ext.dataKey) keyStr = String(site.ext.dataKey);
      if (site.ext.dataIv) ivStr = String(site.ext.dataIv);
    }
    return {
      key: Buffer.from(keyStr, 'utf8'),
      iv: Buffer.from(ivStr, 'utf8'),
    };
  }

  private getBaseUrl(site: ApiSite): string {
    let url = site.api || '';
    if (typeof site.ext === 'object' && site.ext?.url) {
      url = String(site.ext.url);
    }
    return url.replace(/\/+$/, '');
  }

  private decrypt(cipherText: string, key: Buffer, iv: Buffer): any {
    try {
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
      let dec = decipher.update(cipherText, 'base64', 'utf8');
      dec += decipher.final('utf8');
      return JSON.parse(dec);
    } catch (e) {
      console.warn('[AppGetProvider] AES解密失败:', e);
      return null;
    }
  }

  private getHeaders(site: ApiSite): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    return {
      'User-Agent': 'okhttp/3.12.1',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'app-api-verify-time': timestamp,
      'app-ui-mode': 'light',
      ...(site.header || {}),
    };
  }

  async search(query: string, site: ApiSite): Promise<SearchResult[]> {
    const baseUrl = this.getBaseUrl(site);
    const { key, iv } = this.getKeys(site);
    const headers = this.getHeaders(site);

    // 标准 AppGet 协议必须是 POST 请求，且参数名为 keywords 与 page
    const searchBody = new URLSearchParams({
      keywords: query,
      page: '1',
    }).toString();

    // 尝试带 api.php 的路径，若失败则尝试兼容根路径
    const candidatePaths = [
      `${baseUrl}/api.php/getappapi.index/searchList`,
      `${baseUrl}/getappapi.index/searchList`,
    ];

    for (const searchUrl of candidatePaths) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(searchUrl, {
          method: 'POST',
          headers,
          body: searchBody,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const json = await res.json();
        if (!json?.data) continue;

        const decrypted = this.decrypt(json.data, key, iv);
        if (!decrypted) continue;

        const list = decrypted.search_list || decrypted.list || [];
        if (!Array.isArray(list) || list.length === 0) continue;

        return list.map((item: any) => {
          const id = String(item.vod_id || item.id || '').trim();
          const title = String(item.vod_name || item.name || '').trim();
          const poster = String(item.vod_pic || item.pic || '').trim();
          const remarks = String(item.vod_remarks || '');

          const result: SearchResult = {
            id,
            title: cleanHtmlTags(title),
            poster,
            episodes: [],
            episodes_titles: [],
            source: site.key,
            source_name: site.name,
            year: item.vod_year ? String(item.vod_year) : '',
            class: item.vod_class || '',
            desc: cleanHtmlTags(item.vod_content || ''),
            remarks,
            quality_tag: remarks || '4K原画/秒播',
          };
          return decorateSearchResultQuality(result, remarks);
        });
      } catch (err) {
        console.warn(`[AppGetProvider] 搜索请求失败 (${searchUrl}):`, err);
      }
    }

    return [];
  }

  async detail(id: string, site: ApiSite): Promise<SearchResult | null> {
    const baseUrl = this.getBaseUrl(site);
    const { key, iv } = this.getKeys(site);
    const headers = this.getHeaders(site);

    const detailBody = new URLSearchParams({
      vod_id: String(id),
    }).toString();

    const candidatePaths = [
      `${baseUrl}/api.php/getappapi.index/vodDetail`,
      `${baseUrl}/getappapi.index/vodDetail`,
    ];

    for (const detailUrl of candidatePaths) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(detailUrl, {
          method: 'POST',
          headers,
          body: detailBody,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const json = await res.json();
        if (!json?.data) continue;

        const decrypted = this.decrypt(json.data, key, iv);
        if (!decrypted) continue;

        const vod = decrypted.vod || decrypted.data || decrypted;
        const title = String(vod.vod_name || id).trim();
        const poster = String(vod.vod_pic || '').trim();
        const playLists: any[] = decrypted.vod_play_list || [];

        const episodes: string[] = [];
        const episodesTitles: string[] = [];

        // 线路质量智能评分与死链淘汰机制
        const getLineScore = (pl: any): number => {
          const from = String(pl.from || '').toLowerCase();
          const firstUrl = String(pl.urls?.[0]?.url || pl.urls?.[0]?.parse_api_url || '').toLowerCase();

          // 彻底淘汰已知死链/无法连通域名
          if (firstUrl.includes('tyyszywvod') || firstUrl.includes('fengbao12.com')) return -100;

          // 国内极速/高质量秒播切片专线优先
          if (from.includes('hnm3u8') || firstUrl.includes('bfvvs.com')) return 100;
          if (from.includes('ffm3u8') || firstUrl.includes('ffzy')) return 95;
          if (from.includes('rym3u8') || firstUrl.includes('ryplay')) return 90;
          if (from.includes('1080zyk')) return 85;
          if (from.includes('lzm3u8') || firstUrl.includes('lfthirtytwo')) return 80;
          if (from.includes('jsm3u8') || firstUrl.includes('jisuzy')) return 75;
          if (from.includes('dbm3u8')) return 70;
          if (firstUrl.includes('.m3u8')) return 50;
          return 10;
        };

        if (Array.isArray(playLists) && playLists.length > 0) {
          // 按质量评分从高到低排序线路
          const sortedLists = [...playLists].sort((a, b) => getLineScore(b) - getLineScore(a));

          // 优先选用评分最高且非死链的线路
          const bestList = sortedLists.find(l => getLineScore(l) > 0) || sortedLists[0];

          if (bestList && Array.isArray(bestList.urls)) {
            bestList.urls.forEach((u: any, idx: number) => {
              const epUrl = u.url || u.parse_api_url;
              const epName = u.name || `第${idx + 1}集`;
              if (epUrl) {
                episodes.push(epUrl);
                episodesTitles.push(epName);
              }
            });
          }

          // 若最佳线路集数较少（如单集电影正片），将其他可用优质线路也合并进入备用选集
          if (episodes.length <= 2) {
            sortedLists.slice(1, 4).forEach((otherList) => {
              if (getLineScore(otherList) > 0 && Array.isArray(otherList.urls)) {
                otherList.urls.forEach((u: any) => {
                  const epUrl = u.url || u.parse_api_url;
                  const lineTag = otherList.name || otherList.from || '备用';
                  const epName = u.name ? `[${lineTag}] ${u.name}` : `[${lineTag}] 播放线路`;
                  if (epUrl && !episodes.includes(epUrl)) {
                    episodes.push(epUrl);
                    episodesTitles.push(epName);
                  }
                });
              }
            });
          }
        }

        const result: SearchResult = {
          id,
          title: cleanHtmlTags(title),
          poster,
          episodes,
          episodes_titles: episodesTitles,
          source: site.key,
          source_name: site.name,
          year: vod.vod_year ? String(vod.vod_year) : '',
          desc: cleanHtmlTags(vod.vod_content || ''),
          remarks: vod.vod_remarks || '',
        };
        return decorateSearchResultQuality(result);
      } catch (err) {
        console.warn(`[AppGetProvider] 获取详情失败 (${detailUrl}):`, err);
      }
    }

    return null;
  }
}
