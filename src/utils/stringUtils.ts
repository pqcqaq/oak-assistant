// 将驼峰命名的entityName转换为大写开头
export const toUpperFirst = (entityName: string) => {
    return entityName.charAt(0).toUpperCase() + entityName.slice(1);
};  