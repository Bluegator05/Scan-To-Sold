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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-black p-3 border border-[#2f3336] shadow-lg rounded-lg text-sm">
          <p className="font-bold text-[#71767b] mb-1 text-xs uppercase tracking-wider">
            {data.type === 'sold' ? 'Sold Listing' : 'Active Listing'}
          </p>
          <p className="text-[#e7e9ea] mb-2 truncate max-w-[200px] font-medium">{data.title}</p>
          <p className="font-bold text-[#e7e9ea] text-lg">
            ${data.price}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-64 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{
              top: 5,
              right: 30,
              left: 0,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2f3336" />
            <XAxis dataKey="name" hide />
            <YAxis 
              tickFormatter={(value) => `$${value}`} 
              axisLine={false}
              tickLine={false}
              tick={{fill: '#71767b', fontSize: 12}}
            />
            <Tooltip content={<CustomTooltip />} cursor={{fill: '#16181c'}} />
            <ReferenceLine y={avgPrice} stroke="#f59e0b" strokeDasharray="3 3" label={{ position: 'right',  value: 'Avg', fill: '#f59e0b', fontSize: 10 }} />
            <Bar dataKey="price" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell 
                    key={`cell-${index}`} 
                    fill={entry.type === 'sold' ? '#00ba7c' : '#1d9bf0'} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-4 mt-2 text-xs font-medium text-[#71767b]">
            <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-[#1d9bf0]"></div> Active Listing
            </div>
            <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-[#00ba7c]"></div> Sold Item
            </div>
        </div>
    </div>
  );
};

export default MarketChart;