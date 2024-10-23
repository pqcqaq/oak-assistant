import { EntityShape, StorageDesc } from 'oak-domain/lib/types';

export type CreateComponentConfig = {
    folderName: string;
    entityName: string;
    isList: boolean;
    autoProjection: boolean;
};

export type IndexTsTemplate = {
    entityName: string;
    isList: boolean;
    autoProjection: boolean;
    projectionFields?: string[];
};

export type ComponentTemplate = {
    componentName: string;
    entityName: string;
    isList: boolean;
};

export type LocaleTemplate = {};

export type StyleLessTemplate = {};

export type CreateOakComponent = {
    index: IndexTsTemplate;
    webPcTsx: ComponentTemplate;
    webTsx: ComponentTemplate;
    localeZhCN: LocaleTemplate;
    styleLess: StyleLessTemplate;
};

type Language = 'zh_CN' | 'en_US';

export type LanguageValue = {
    name: string;
    attr: {
        [key: string]: string;
    };
    action?: {
        [key: string]: string;
    };
};

export type LocalesDef = {
    [L in Language]?: LanguageValue;
};

export interface EntityDesc<SH extends EntityShape> extends StorageDesc<SH> {
    projectionList: string[];
    locales: LocalesDef;
}

// 'web.tsx', 'web.pc.tsx', 'render.native.tsx', 'render.ios.tsx', 'render.android.tsx', 'index.xml'
export type Platporm = 'web.pc' | 'web' | 'native' | 'miniapp';

export type ComponentDef = {
    type: Platporm;
    path: string;
    children: EntityComponentDef[];
};

export type EntityComponentDef = {
    path: string;
    entityName: string;
    isList: boolean;
    components: ComponentDef[];
    formDataAttrs?: string[];
    methodNames?: string[];
    propertiesAttrs?: string[];
};

export type EnhtityComponentMap = {
    [entityName: string]: EntityComponentDef[];
};

export type DocumentValue = {
    value: string | number | boolean;
    pos: {
        start: number;
        end: number;
    };
}

export type RenderProps = {
    dictName: DocumentValue;
    entityName: DocumentValue;
    isList: DocumentValue;
    attrList?: DocumentValue[];
    methodList?: DocumentValue[];
}

export type TriggerDef = {
    entity: string;
    action: string;
    when: string;
    path: string;
};

export type EntityLocale = {
    [key: string]: LanguageValue;
};

export type LocaleData = {
    [key: string]: string | LocaleData;
};

export type NamespaceLocale = {
    [key: string]: LocaleData;
};

export type ComponentLocale = {
    [path: string]: LocaleData;
};

export type LocaleDef = {
    namespaced: NamespaceLocale;
    entities: EntityLocale;
    components: ComponentLocale;
};

export type LocaleItem = {
    label: string;
    value: string;
    desc: string;
    path: string;
};
