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

export interface EntityDesc<SH extends EntityShape> extends StorageDesc<SH> {
    projectionList: string[];
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
};

export type EnhtityComponentMap = {
    [entityName: string]: EntityComponentDef[];
};

export type TriggerDef = {
    entity: string;
    action: string;
    when: string;
    path: string;
};
