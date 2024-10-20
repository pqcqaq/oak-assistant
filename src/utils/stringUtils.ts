// 将驼峰命名的entityName转换为大写开头
export const toUpperFirst = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
};  

// 转为小驼峰
export const toLowerFirst = (name: string) => {
    return name.charAt(0).toLowerCase() + name.slice(1);
};