// 将驼峰命名的entityName转换为大写开头
export const toUpperFirst = (name: string) => {
    return name.charAt(0).toUpperCase() + name.slice(1);
};  