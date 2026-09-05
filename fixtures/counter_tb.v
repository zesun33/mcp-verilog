`timescale 1ns/1ps

module counter_tb;
    reg clk;
    reg rst;
    reg enable;
    wire [7:0] count;

    counter #(.WIDTH(8)) dut (
        .clk(clk),
        .rst(rst),
        .enable(enable),
        .count(count)
    );

    always #5 clk = ~clk;

    initial begin
        clk = 0;
        rst = 1;
        enable = 0;

        #20;
        rst = 0;
        enable = 1;

        #50;
        if (count == 8'd0) begin
            $fatal(1, "FAIL: Counter did not increment!");
        end

        $display("PASS: Counter testbench completed successfully with count=%0d", count);
        $finish(0);
    end
endmodule
