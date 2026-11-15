// snappyjs ships no type declarations. Only `uncompress` is used.
declare module "snappyjs" {
  const snappy: {
    uncompress(input: Uint8Array): Uint8Array;
  };
  export default snappy;
}
