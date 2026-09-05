module broken_module (
    input wire clk,
    output reg [7:0] out
);

    // Missing semicolon and broken syntax intentionally
    always @(posedge clk) begin
        out <= out + 1
    end

endmodule
