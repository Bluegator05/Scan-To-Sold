import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Cell
} from 'recharts';
import { MarketData } from '../types';

interface MarketChartProps {
    data: MarketData[];
}

const MarketChart: React.FC<MarketChartProps> = ({ data }) => {
    if (data.length === 0) return null;

    // Transform data for chart
    const chartData = data.map((item, index) => ({
        name: index + 1,
        price: item.price,
        type: item.type,
        title: item.title
    })).sort((a, b) => a.price - b.price);

    const avgPrice = data.reduce((acc, curr) => acc + curr.price, 0) / data.length;

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-slate-900 p-3 border border-slate-700 shadow-xl rounded-lg text-sm z-50">
                    <p className="font-bold text-slate-400 mb-1 text-xs uppercase tracking-wider">
                        {data.type === 'sold' ? 'Sold Listing' : 'Active Listing'}
                    </p>
                    <p className="text-white mb-2 truncate max-w-[200px] font-medium">{data.title}</p>
                    <p className="font-bold text-white text-lg">
                        ${data.price.toFixed(2)}
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="h-48 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={chartData}
                    margin={{
                        top: 5,
                        right: 10,
                        left: 0,
                        bottom: 5,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                    <XAxis dataKey="name" hide />
                    <YAxis
                        tickFormatter={(value) => `$${value}`}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        width={35}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b', opacity: 0.5 }} />
                    <ReferenceLine y={avgPrice} stroke="#eab308" strokeDasharray="3 3" label={{ position: 'right', value: 'Avg', fill: '#eab308', fontSize: 10 }} />
                    <Bar dataKey="price" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.type === 'sold' ? '#39ff14' : '#3b82f6'}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2 text-xs font-medium text-slate-500">
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div> Active
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-[#39ff14]"></div> Sold
                </div>
            </div>
        </div>
    );
};

export default MarketChart;
