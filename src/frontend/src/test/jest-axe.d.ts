declare module 'jest-axe' {
  export function configureAxe(config?: any): any;
  export function axe(element: any): Promise<any>;
}