import { ApiSite } from '../config';
import { SourceProvider } from './types';
import { CzsappProvider } from './czsapp';
import { JpysProvider } from './jpys';
import { DubokuProvider } from './duboku';
import { AikanProvider } from './aikan';
import { ReboProvider } from './rebo';
import { C1905Provider } from './c1905';

// 注册所有协议驱动 Provider 实例（解耦设计，源本身不写死，纯靠驱动匹配）
const providers: SourceProvider[] = [
  new CzsappProvider(),
  new JpysProvider(),
  new DubokuProvider(),
  new AikanProvider(),
  new ReboProvider(),
  new C1905Provider(),
];

/**
 * 根据源的配置特征（type、api 或 ext）动态查找匹配的专线协议处理器
 * 若返回 null，则说明是标准苹果 CMS 规范源，下游将继续执行默认的 videolist 逻辑
 */
export function findProvider(site: ApiSite): SourceProvider | null {
  for (const provider of providers) {
    if (provider.canHandle(site)) {
      return provider;
    }
  }
  return null;
}

export * from './types';
export * from './czsapp';
export * from './jpys';
export * from './duboku';
export * from './aikan';
export * from './rebo';
export * from './c1905';
