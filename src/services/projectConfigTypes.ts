/** 当前成员可读的非敏感配置 DTO；sourceScopeId 用于拒绝全局或其他项目登记。 */
export type EffectiveProjectConfig = {
  key: string;
  value: string;
  valueType: string;
  sourceScopeId: string;
};
