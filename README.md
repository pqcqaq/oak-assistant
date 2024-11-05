# oak-assistant README

oak框架适配性插件，为你的开发助力！

> 当你在开发Oak框架的项目时，是否经常遇到以下问题：
>
> - 经常需要翻找Entity的定义和Schema文件，费时费力。
> - oakPath拼错导致的白屏需要长时间的debug。
> - t的locale不知道到底该怎么写
> - 创建OakComponent的时候要新建一大堆文件，太麻烦。
> - ......

### 那么你就需要这个插件，来加速Oak项目的开发



## 配置项

```json
{
  "projectDir": "./",
  "checker": {
    "onInvalidReturn": "warn",
    "onInvalidDestructuring": "error",
    "onNeedPromiseCheck": "error"
  },
  "trigger": {
    "onReturnLiteral": "warn",
    "onNoAsyncFn": "error",
    "onNoAwaitContext": "error"
  },
  "i18n": {
    "onMissingKey": "error",
    "onKeyBlank": "warn"
  },
  "oakComponent": {
    "onInvalidEntity": "error",
    "onInvalidIsList": "error",
    "onMissingDataAttrs": "warn",
    "onMissingMethods": "error"
  },
  "oakPath": {
    "onInvalidPath": "error"
  }
}
```

- 类型：

    ```ts
    export type Level = 'ignore' | 'error' | 'warn' | 'info';
    
    export type OakConfiog = {
        projectDir: string;
        // checker配置
        checker?: {
            // 不合法的返回值(checker应该返回执行链或者结果)
            onInvalidReturn?: Level;
            // 不能为解构赋值(context调用不能解构)
            onInvalidDestructuring?: Level;
            // 需要判断Promise(context调用必须判断是否为Promise)
            onNeedPromiseCheck?: Level;
        }
        // 触发器配置
        trigger?: {
            // 返回值为字面量1
            onReturnLiteral?: Level;
            // fn不是async
            onNoAsyncFn?: Level;
            // 没有await context
            onNoAwaitContext?: Level;
        };
        // i18n配置
        i18n?: {
            // 缺少key
            onMissingKey?: Level;
            // key为空
            onKeyBlank?: Level;
        };
        // oak组件配置
        oakComponent?: {
            // entity无效
            onInvalidEntity?: Level;
            // isList无效
            onInvalidIsList?: Level;
            // 缺少data属性
            onMissingDataAttrs?: Level;
            // 缺少方法
            onMissingMethods?: Level;
        };
        // oak路径配置
        oakPath?: {
            // 路径无效
            onInvalidPath?: Level;
        };
    };
    
    ```

    

## 功能

1. Panel面板

    点击左侧按钮，打开oak entities面板

    ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/202410232303793.png)

    ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/202410232303790.png)

    - 你可以点击`切换实体类显示范围`，来指定是显示全部的实体类，还是只显示项目中定义的实体类

    

    - 点击展开某一个entity，可以查看以下信息

        - 项目中所有跟此entity相关联的组件

            ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/202410232305969.png)

        - 点击某一个组件，可以快速跳转到其index.ts文件

        - 你也可以右键某一个组件，从项目中删除（此操作会删除整个组件所在的文件夹）

    

1. 快速创建OakComponent

   - 你可以在src/pages或者src/components目录内的任何文件夹中右键，`创建OAK组件` 接下来会引导你快速创建oak组件

     ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/20241021113922.png)

   - 你也可以在Oak Entities的页面中，对某一个`实体`的`项目组件`点击右键，可以快速在components中创建该entity对应的组件

     ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/20241021114028.png)

   - 同时，你也可以在Oak Entities中快速删除一个oak组件

     ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/20241021114054.png)

2. 随时跳转到Entity的定义或者Schema文件

   - 在Oak Entities窗口中，你可以在实体名称上点击右键，一键跳转。

     ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/20241021114222.png)

3. 实时检查oakPath的定义是否合法

   - 前提条件：请务必使用以下的使用形式来定义 *固定的* oakPath

     ```ts
     `${oakFullpath}.attr`
     ```

     

   - 自动扫描

     - 插件会自动检查attr是否在当前组件所定义的entity的Schema属性中

   - 扫描范围

     - 必须是Oak组件
     - 必须定义组件的形参为WebComponentProps，并且第二个参数为实体类的名称

   - 跳转到Schema定义

     - 如果attr是一个合法的属性，可以点击跳转到当前entity的定义Schema

       ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/20241021114711.png)
     
   - 属性提示

     - 在编写时，当你在${oakFullpath}的后面输入`.`，就可以获得当前entity下的所有可选attr的提示

       ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/202410232240998.png)
       
       
       
       

4. i18n检查与跳转

   - 当打开或者编辑tsx文件时，会自动扫描该文件下的所有的t方法调用，并提供代码提示以及定义检查

   - 语法提示

     - 当在t()中输入任意引号的一种，会提示您当前文件可用的所有i18n选项

       ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/20241021115215.png)

   - i18n检查

     - 插件会根据您正在编辑的文件，自动扫描公共命名空间，所有实体类，以及当前文件目录下的locales定义

     - 如果i18n的引用是合法的，你可以点击跳转到定义

       ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/20241021115358.png)

     - 如果i18n的引用不合法，会显示警告信息

       ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/20241021115449.png)
       
     - 立即创建i18n
     
       - 当找不到locale定义的时候，可以点击快速修复，在当前组件的locale中创建一个新的键值对
       - 如果当前组件下不存在locales文件夹，会自动创建locales/zh_CN.json文件

5. 对于WebComponentProps的泛型检查

   - ![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/202410232243249.png)
   - 检查entity的名称是否与index.ts中定义的相同
   - 检查isList的参数是否与index.ts中相同
   - 检查所有的data属性是否在index.ts中的formData中有返回值，或者已经定义在properties中
   - 检查所有的方法定义是否都在index.ts中的methods中

6. 提供相关快速跳转功能

   1. 当entity：""出现项目中已经定义的实体时，提供一键跳转到定义的功能
   2. 在WebComponentProps的data参数和methods参数中，可以一键跳转到具体的定义位置

7. 提供快速修复功能

   1. 在locales未定义的情况下，可以一键修复，在本地的locales目录中创建该键值对。

   2. WebComponentProps中的entity或者isList值错误，可以一键修复。

   3. 当WebComponentProps中的data未定义或者methods不存在，可以一键在index.ts中创建。

      


## 安装并使用

在插件市场搜索oak-assistant

![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/202410232301502.png)

启用插件后，在oak项目内，会自动扫描所有的entity

![启动项目时分析entity](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/20241021113726.png)

然后会扫描所有的components，i18n信息，等待全部加载完毕之后，就可以开始快乐的编程了~

![](https://cdn.jsdelivr.net/gh/pqcqaq/imageSource/upload/202410232302399.png)





