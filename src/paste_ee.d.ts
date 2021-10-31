declare module "paste.ee" {
    export default function create(data: string, token: string): Promise<{ id: string }>;
}
