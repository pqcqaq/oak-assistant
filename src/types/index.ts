import { EntityShape, StorageDesc } from "oak-domain/lib/types";

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
}

export type ComponentTemplate = {
    componentName: string;
    entityName: string;
    isList: boolean;
}

export type LocaleTemplate = {

}

export type StyleLessTemplate = {

}

export type CreateOakComponent = {
    index: IndexTsTemplate;
    webPcTsx: ComponentTemplate;
    webTsx: ComponentTemplate;
    localeZhCN: LocaleTemplate;
    styleLess: StyleLessTemplate;
}

export interface EntityDesc<SH extends EntityShape> extends StorageDesc<SH> {
    projectionList: string[];
}