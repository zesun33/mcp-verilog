`timescale 1ns/1ps

module failing_tb;
    reg clk;

    always #5 clk = ~clk;

    initial begin
        clk = 0;
        #20;
        $fatal(1, "SIMULATION_ASSERTION_FAILED: Test intentional failure.");
    end
endmodule
