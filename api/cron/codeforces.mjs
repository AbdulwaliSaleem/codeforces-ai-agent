import { runAgent } from "../../agent.mjs";

export async function GET(request) {
    const auth =
        request.headers.get("authorization");

    if (
        !process.env.CRON_SECRET ||
        auth !== `Bearer ${process.env.CRON_SECRET}`
    ) {
        return Response.json(
            { success: false, error: "Unauthorized" },
            { status: 401 }
        );
    }

    try {
        const result = await runAgent();

        return Response.json({
            success: true,
            result
        });
    } catch (error) {
        console.error(error);

        return Response.json(
            {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error"
            },
            { status: 500 }
        );
    }
}