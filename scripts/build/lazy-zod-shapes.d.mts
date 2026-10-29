type LazyZodShapesLoadResult = { contents: string; loader: 'ts' } | undefined;

type LazyZodShapesBuild = {
  onLoad(
    options: { filter: RegExp },
    callback: (args: { path: string }) => Promise<LazyZodShapesLoadResult>,
  ): void;
};

export function transformLazyZodShapes(
  source: string,
  fileName: string,
): string;

export function lazyZodShapes(): {
  name: string;
  setup(build: LazyZodShapesBuild): void;
};
