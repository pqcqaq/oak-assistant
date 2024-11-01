import * as ts from 'typescript/lib/tsserverlibrary';

function isPromiseType(typeChecker: ts.TypeChecker, type: ts.Type): boolean {
  if (type.isUnion()) {
    return type.types.some(t => isPromiseType(typeChecker, t));
  }
  
  const symbol = type.getSymbol();
  if (symbol && symbol.name === 'Promise') {
    return true;
  }
  
  const baseTypes = type.getBaseTypes();
  return baseTypes ? baseTypes.some(t => isPromiseType(typeChecker, t)) : false;
}

function init(modules: { typescript: typeof ts }) {
  const ts = modules.typescript;

  function create(info: ts.server.PluginCreateInfo) {
    const proxy: ts.LanguageService = Object.create(null);
    for (let k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      const x = info.languageService[k] as Function;
      proxy[k] = (...args: any[]) => x.apply(info.languageService, args);
    }

    proxy.getSemanticDiagnostics = (fileName) => {
      const prior = info.languageService.getSemanticDiagnostics(fileName);
      const sourceFile = info.languageService.getProgram()?.getSourceFile(fileName);

      if (sourceFile) {
        const typeChecker = info.languageService.getProgram()?.getTypeChecker();

        ts.forEachChild(sourceFile, function checkNode(node) {
          if (ts.isCallExpression(node)) {
            const signature = typeChecker?.getResolvedSignature(node);
            const returnType = signature?.getReturnType();

            if (returnType && typeChecker && isPromiseType(typeChecker, returnType)) {
              if (!ts.isAwaitExpression(node.parent)) {
                prior.push({
                  file: sourceFile,
                  start: node.getStart(),
                  length: node.getWidth(),
                  messageText: "This function returns a Promise and should be awaited.",
                  category: ts.DiagnosticCategory.Warning,
                  code: 9999,
                });
              }
            }
          }

          ts.forEachChild(node, checkNode);
        });
      }

      return prior;
    };

    return proxy;
  }

  return { create };
}

export = init;
