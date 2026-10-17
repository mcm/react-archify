declare const processShim: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode: number | undefined;
};
export default processShim;
